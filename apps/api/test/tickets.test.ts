import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { events, tickets, walletLedger } from '../src/db/schema';
import { ticketSigner } from '../src/lib/ticket-signing';
import { makeSlug } from '../src/modules/events/events.service';
import { browser, buildApp, db, signedIn, TICKET_SECRET, useTestDb } from './helpers';

useTestDb();

const HOUR = 60 * 60 * 1000;

async function insertEvent(values: Partial<typeof events.$inferInsert> = {}) {
  const [row] = await db
    .insert(events)
    .values({
      slug: makeSlug('test'),
      title: 'Spring Formal',
      category: 'party',
      venue: 'Great Hall',
      startsAt: new Date(Date.now() + 72 * HOUR),
      endsAt: new Date(Date.now() + 76 * HOUR),
      capacity: 100,
      priceCents: 15000,
      status: 'published',
      ...values,
    })
    .returning();
  return row!;
}

/** A signed-in student with `cents` already in their wallet. */
async function student(cents = 0, app = buildApp()) {
  const { agent, user } = await signedIn('student', app);
  if (cents) {
    await agent.post('/api/wallet/top-ups').send({ amountCents: cents, requestId: randomUUID() });
  }
  return { agent, user };
}

const buy = (agent: Awaited<ReturnType<typeof student>>['agent'], eventId: string) =>
  agent.post(`/api/events/${eventId}/tickets`);

describe('buying a ticket', () => {
  it('issues a signed ticket and debits the wallet in one step', async () => {
    const event = await insertEvent();
    const { agent } = await student(20000);

    const res = await buy(agent, event.id);
    expect(res.status).toBe(201);
    const ticket = res.body.ticket;
    expect(ticket).toMatchObject({ status: 'valid', pricePaidCents: 15000 });
    expect(ticket.code).toMatch(/^MTH-\w{4}-\w{4}$/);
    expect(ticket.event).toMatchObject({ id: event.id, ticketsSold: 1 });
    expect(ticketSigner(TICKET_SECRET).verify(ticket.qrPayload)).toBe(ticket.id);

    const wallet = (await agent.get('/api/wallet')).body;
    expect(wallet.balanceCents).toBe(5000);
    expect(wallet.entries[0]).toMatchObject({
      amountCents: -15000,
      description: 'Ticket: Spring Formal',
    });
  });

  it('gives free tickets without touching the wallet', async () => {
    const event = await insertEvent({ priceCents: 0 });
    const { agent } = await student();
    expect((await buy(agent, event.id)).status).toBe(201);
    expect(await db.select().from(walletLedger)).toHaveLength(0);
  });

  it('refuses when the balance is too low, and charges nothing', async () => {
    const event = await insertEvent();
    const { agent } = await student(10000);
    const res = await buy(agent, event.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await db.select().from(tickets)).toHaveLength(0);
    expect((await agent.get('/api/wallet')).body.balanceCents).toBe(10000);
  });

  it('allows one active ticket per student, even on a double click', async () => {
    const event = await insertEvent();
    const { agent } = await student(50000);
    const results = await Promise.all([1, 2, 3].map(() => buy(agent, event.id)));

    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('ALREADY_HAS_TICKET');
    expect((await agent.get('/api/wallet')).body.balanceCents).toBe(35000);
  });

  it('never sells past capacity when the last spot is contested', async () => {
    const event = await insertEvent({ capacity: 2, priceCents: 0 });
    const buyers = await Promise.all([1, 2, 3, 4, 5].map(() => student()));
    const results = await Promise.all(buyers.map(({ agent }) => buy(agent, event.id)));

    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.body.error?.code === 'SOLD_OUT')).toHaveLength(3);
  });

  it('refuses drafts, cancelled and ended events', async () => {
    const { agent } = await student(50000);
    const draft = await insertEvent({ status: 'draft' });
    const cancelled = await insertEvent({ status: 'cancelled' });
    const ended = await insertEvent({
      startsAt: new Date(Date.now() - 5 * HOUR),
      endsAt: new Date(Date.now() - HOUR),
    });

    expect((await buy(agent, draft.id)).status).toBe(404);
    expect((await buy(agent, cancelled.id)).body.error.code).toBe('EVENT_CANCELLED');
    expect((await buy(agent, ended.id)).body.error.code).toBe('EVENT_ENDED');
  });

  it('is for students only', async () => {
    const event = await insertEvent({ priceCents: 0 });
    expect((await browser().post(`/api/events/${event.id}/tickets`)).status).toBe(401);
    const { agent } = await signedIn('staff');
    expect((await buy(agent, event.id)).status).toBe(403);
  });

  it('shows the buyer’s ticket on the event page', async () => {
    const event = await insertEvent({ priceCents: 0 });
    const { agent } = await student();
    const { body } = await buy(agent, event.id);

    expect((await agent.get(`/api/events/${event.slug}`)).body.event.myTicketId).toBe(
      body.ticket.id,
    );
    expect((await browser().get(`/api/events/${event.slug}`)).body.event).toMatchObject({
      myTicketId: null,
      ticketsSold: 1,
    });
  });
});

describe('my tickets', () => {
  it('lists upcoming and past tickets separately, and only my own', async () => {
    const soon = await insertEvent({ title: 'Soon', priceCents: 0 });
    const gone = await insertEvent({ title: 'Gone', priceCents: 0 });
    const { agent } = await student();
    await buy(agent, soon.id);
    await buy(agent, gone.id);
    await db
      .update(events)
      .set({ startsAt: new Date(Date.now() - 5 * HOUR), endsAt: new Date(Date.now() - HOUR) })
      .where(eq(events.id, gone.id));
    const other = await student();
    await buy(other.agent, soon.id);

    const upcoming = (await agent.get('/api/tickets')).body.tickets;
    const past = (await agent.get('/api/tickets?scope=past')).body.tickets;
    expect(upcoming.map((t: { event: { title: string } }) => t.event.title)).toEqual(['Soon']);
    expect(past.map((t: { event: { title: string } }) => t.event.title)).toEqual(['Gone']);
  });

  it('hides other students’ tickets', async () => {
    const event = await insertEvent({ priceCents: 0 });
    const owner = await student();
    const { body } = await buy(owner.agent, event.id);
    const stranger = await student();

    expect((await stranger.agent.get(`/api/tickets/${body.ticket.id}`)).status).toBe(404);
    expect((await stranger.agent.post(`/api/tickets/${body.ticket.id}/cancel`)).status).toBe(404);
  });
});

describe('cancelling a ticket', () => {
  it('refunds a paid ticket and frees the spot', async () => {
    const event = await insertEvent({ capacity: 1 });
    const { agent } = await student(15000);
    const { body } = await buy(agent, event.id);

    const res = await agent.post(`/api/tickets/${body.ticket.id}/cancel`);
    expect(res.body.ticket).toMatchObject({
      status: 'cancelled',
      cancelReason: 'by_holder',
      qrPayload: null,
    });

    const wallet = (await agent.get('/api/wallet')).body;
    expect(wallet.balanceCents).toBe(15000);
    expect(wallet.entries[0].description).toBe('Refund: Spring Formal');

    const next = await student(15000);
    expect((await buy(next.agent, event.id)).status).toBe(201);
  });

  it('can’t refund twice', async () => {
    const event = await insertEvent();
    const { agent } = await student(15000);
    const { body } = await buy(agent, event.id);
    const results = await Promise.all(
      [1, 2].map(() => agent.post(`/api/tickets/${body.ticket.id}/cancel`)),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await agent.get('/api/wallet')).body.balanceCents).toBe(15000);
  });

  it('closes 24 hours before a paid event, but free tickets can be released until the start', async () => {
    const soonPaid = await insertEvent({
      startsAt: new Date(Date.now() + 10 * HOUR),
      endsAt: new Date(Date.now() + 12 * HOUR),
    });
    const soonFree = await insertEvent({
      priceCents: 0,
      startsAt: new Date(Date.now() + 10 * HOUR),
      endsAt: new Date(Date.now() + 12 * HOUR),
    });
    const { agent } = await student(15000);
    const paid = (await buy(agent, soonPaid.id)).body.ticket;
    const free = (await buy(agent, soonFree.id)).body.ticket;

    const closed = await agent.post(`/api/tickets/${paid.id}/cancel`);
    expect(closed.body.error.code).toBe('CANCEL_CLOSED');
    expect((await agent.post(`/api/tickets/${free.id}/cancel`)).status).toBe(200);
  });
});

describe('event changes after sales', () => {
  async function adminWithSoldEvent() {
    const { agent } = await signedIn('admin');
    const event = await insertEvent({ capacity: 10 });
    const buyer = await student(15000);
    await buy(buyer.agent, event.id);
    return { agent, event, buyer };
  }

  const editBody = (event: Awaited<ReturnType<typeof insertEvent>>, changes: object) => ({
    title: event.title,
    category: event.category,
    venue: event.venue,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    capacity: event.capacity,
    priceCents: event.priceCents,
    ...changes,
  });

  it('cancelling the event refunds every holder in one go', async () => {
    const { agent, event, buyer } = await adminWithSoldEvent();
    const free = await insertEvent({ priceCents: 0 });
    await buy(buyer.agent, free.id);

    const res = await agent.post(`/api/admin/events/${event.id}/cancel`).send({ reason: 'Storm' });
    expect(res.body.event).toMatchObject({ status: 'cancelled', ticketsSold: 0 });

    expect((await buyer.agent.get('/api/wallet')).body.balanceCents).toBe(15000);
    const past = (await buyer.agent.get('/api/tickets?scope=past')).body.tickets;
    expect(past[0]).toMatchObject({ status: 'cancelled', cancelReason: 'event_cancelled' });
    // The other event's ticket is untouched.
    expect((await buyer.agent.get('/api/tickets')).body.tickets).toHaveLength(1);
  });

  it('locks the price and the minimum capacity', async () => {
    const { agent, event } = await adminWithSoldEvent();
    const res = await agent
      .put(`/api/admin/events/${event.id}`)
      .send(editBody(event, { priceCents: 9900, capacity: 1 }));
    expect(res.status).toBe(409);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['priceCents']);

    const capacity = await agent
      .put(`/api/admin/events/${event.id}`)
      .send(editBody(event, { capacity: 1 }));
    expect(capacity.status).toBe(200);
  });

  it('won’t take capacity below the tickets sold', async () => {
    const { agent, event } = await adminWithSoldEvent();
    const second = await student(15000);
    await buy(second.agent, event.id);

    const res = await agent
      .put(`/api/admin/events/${event.id}`)
      .send(editBody(event, { capacity: 1 }));
    expect(res.body.error.fields.capacity).toEqual(['2 tickets are already sold']);
  });

  it('won’t unpublish once tickets are sold', async () => {
    const { agent, event } = await adminWithSoldEvent();
    const res = await agent.post(`/api/admin/events/${event.id}/unpublish`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/Cancel it instead/);
  });
});
