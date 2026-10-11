import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { eventStaff, events, scanLogs, tickets } from '../src/db/schema';
import { ticketSigner } from '../src/lib/ticket-signing';
import { makeSlug } from '../src/modules/events/events.service';
import { buildApp, db, ORIGIN, signedIn, TICKET_SECRET, useTestDb } from './helpers';

useTestDb();

const HOUR = 60 * 60 * 1000;
const signer = ticketSigner(TICKET_SECRET);

/** A published event that is on right now (gates open). */
async function liveEvent(values: Partial<typeof events.$inferInsert> = {}) {
  const [row] = await db
    .insert(events)
    .values({
      slug: makeSlug('gate'),
      title: 'Spring Formal',
      category: 'party',
      venue: 'Great Hall',
      startsAt: new Date(Date.now() - HOUR),
      endsAt: new Date(Date.now() + 3 * HOUR),
      capacity: 100,
      priceCents: 0,
      status: 'published',
      ...values,
    })
    .returning();
  return row!;
}

/** A student holding a valid ticket for `eventId`. */
async function holder(eventId: string, app = buildApp()) {
  const { agent, user } = await signedIn('student', app);
  // Buying is only allowed before the end; insert directly so tests control timing.
  const [ticket] = await db
    .insert(tickets)
    .values({
      code: `SPU-${randomUUID().slice(0, 4).toUpperCase()}-TEST`,
      eventId,
      userId: user.id,
      pricePaidCents: 0,
    })
    .returning();
  return { agent, user, ticket: ticket!, payload: signer.payload(ticket!.id) };
}

/** Gate staff assigned to the event. */
async function staffFor(eventId: string, app = buildApp()) {
  const s = await signedIn('staff', app);
  await db.insert(eventStaff).values({ eventId, userId: s.user.id });
  return s;
}

const scan = (
  agent: Awaited<ReturnType<typeof staffFor>>['agent'],
  eventId: string,
  body: object,
) => agent.post(`/api/gate/events/${eventId}/scan`).send(body);

describe('scanning', () => {
  it('admits a valid ticket once and logs it', async () => {
    const event = await liveEvent();
    const { agent } = await staffFor(event.id);
    const { ticket, payload, user } = await holder(event.id);

    const res = await scan(agent, event.id, { payload, gate: 'Gate A' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      result: 'admitted',
      ticket: {
        code: ticket.code,
        holderName: `${user.firstName} ${user.lastName}`,
        gate: 'Gate A',
      },
      stats: { checkedIn: 1, ticketsSold: 1, capacity: 100 },
    });

    const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(row).toMatchObject({ status: 'used', checkedInGate: 'Gate A' });
    expect(await db.select().from(scanLogs)).toHaveLength(1);
  });

  it('says when and where a ticket was already used', async () => {
    const event = await liveEvent();
    const { agent } = await staffFor(event.id);
    const { payload } = await holder(event.id);
    await scan(agent, event.id, { payload, gate: 'Gate B' });

    const again = await scan(agent, event.id, { payload, gate: 'Gate A' });
    expect(again.body.result).toBe('already_used');
    expect(again.body.message).toMatch(/^Already scanned at \d\d:\d\d by Gate B$/);
    expect(again.body.stats.checkedIn).toBe(1);
  });

  it('admits exactly once when two gates scan the same ticket at the same moment', async () => {
    const event = await liveEvent();
    const gateA = await staffFor(event.id);
    const gateB = await staffFor(event.id);
    const { payload } = await holder(event.id);

    const results = await Promise.all([
      scan(gateA.agent, event.id, { payload, gate: 'A' }),
      scan(gateB.agent, event.id, { payload, gate: 'B' }),
      scan(gateA.agent, event.id, { payload, gate: 'A' }),
    ]);
    expect(results.map((r) => r.body.result).sort()).toEqual([
      'admitted',
      'already_used',
      'already_used',
    ]);
    expect(await db.select().from(scanLogs)).toHaveLength(3);
  });

  it('accepts the short code typed by hand, in any case', async () => {
    const event = await liveEvent();
    const { agent } = await staffFor(event.id);
    const { ticket } = await holder(event.id);
    const res = await scan(agent, event.id, { code: ticket.code.toLowerCase() });
    expect(res.body.result).toBe('admitted');
  });

  it('rejects forged, tampered and unknown codes', async () => {
    const event = await liveEvent();
    const { agent } = await staffFor(event.id);
    const { ticket } = await holder(event.id);

    const forged = ticketSigner('someone-elses-secret-'.padEnd(40, 'x')).payload(ticket.id);
    const tampered = signer.payload(ticket.id).replace(ticket.id, randomUUID());
    for (const body of [
      { payload: forged },
      { payload: tampered },
      { payload: 'hello' },
      { code: 'SPU-ZZZZ-ZZZZ' },
    ]) {
      const res = await scan(agent, event.id, body);
      expect(res.body.result).toBe('invalid');
    }
    const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(row!.status).toBe('valid');
  });

  it('turns away tickets for another event and cancelled tickets', async () => {
    const event = await liveEvent();
    const other = await liveEvent({ title: 'Jazz Night' });
    const { agent } = await staffFor(event.id);
    const wrong = await holder(other.id);
    const cancelled = await holder(event.id);
    await db
      .update(tickets)
      .set({ status: 'cancelled' })
      .where(eq(tickets.id, cancelled.ticket.id));

    const a = await scan(agent, event.id, { payload: wrong.payload });
    expect(a.body).toMatchObject({
      result: 'wrong_event',
      message: 'This ticket is for Jazz Night',
    });
    expect((await scan(agent, event.id, { payload: cancelled.payload })).body.result).toBe(
      'cancelled',
    );
  });

  it('only scans while the gates are open', async () => {
    const later = await liveEvent({
      startsAt: new Date(Date.now() + 5 * HOUR),
      endsAt: new Date(Date.now() + 8 * HOUR),
    });
    const doorsOpen = await liveEvent({
      startsAt: new Date(Date.now() + 2 * HOUR),
      endsAt: new Date(Date.now() + 5 * HOUR),
    });
    const s1 = await staffFor(later.id);
    const s2 = await staffFor(doorsOpen.id);
    const early = await holder(later.id);
    const onTime = await holder(doorsOpen.id);

    const res = await scan(s1.agent, later.id, { payload: early.payload });
    expect(res.body.result).toBe('not_open');
    expect(res.body.message).toMatch(/^Gates open /);
    expect((await scan(s2.agent, doorsOpen.id, { payload: onTime.payload })).body.result).toBe(
      'admitted',
    );
  });

  it('requires a QR payload or a code, not both', async () => {
    const event = await liveEvent();
    const { agent } = await staffFor(event.id);
    expect((await scan(agent, event.id, {})).status).toBe(400);
    expect((await scan(agent, event.id, { payload: 'x', code: 'SPU-AAAA-AAAA' })).status).toBe(400);
  });
});

describe('access', () => {
  it('lets only assigned staff, and any admin, work a gate', async () => {
    const event = await liveEvent();
    const { payload } = await holder(event.id);
    const stranger = await signedIn('staff');
    const student = await signedIn('student');
    const admin = await signedIn('admin');

    expect((await scan(stranger.agent, event.id, { payload })).status).toBe(403);
    expect((await scan(student.agent, event.id, { payload })).status).toBe(403);
    expect((await scan(admin.agent, event.id, { payload })).body.result).toBe('admitted');
  });

  it('lists only my assigned events that are on or coming up', async () => {
    const mine = await liveEvent({ title: 'Mine' });
    await liveEvent({ title: 'Not mine' });
    await liveEvent({
      title: 'Mine but over',
      startsAt: new Date(Date.now() - 5 * HOUR),
      endsAt: new Date(Date.now() - HOUR),
    });
    const { agent, user } = await staffFor(mine.id);
    const over = await db.select().from(events).where(eq(events.title, 'Mine but over'));
    await db.insert(eventStaff).values({ eventId: over[0]!.id, userId: user.id });

    const res = await agent.get('/api/gate/events');
    expect(res.body.events.map((e: { title: string }) => e.title)).toEqual(['Mine']);
  });
});

describe('staff assignment', () => {
  it('lets admins choose the gate staff for an event', async () => {
    const event = await liveEvent();
    const admin = await signedIn('admin');
    const s1 = await signedIn('staff');
    const s2 = await signedIn('staff');

    expect((await admin.agent.get('/api/admin/staff')).body.staff).toHaveLength(2);
    const res = await admin.agent
      .put(`/api/admin/events/${event.id}/staff`)
      .send({ userIds: [s1.user.id, s2.user.id, s1.user.id] });
    expect(res.body.staff).toHaveLength(2);

    await admin.agent.put(`/api/admin/events/${event.id}/staff`).send({ userIds: [s2.user.id] });
    const now = await admin.agent.get(`/api/admin/events/${event.id}/staff`);
    expect(now.body.staff.map((s: { id: string }) => s.id)).toEqual([s2.user.id]);
  });

  it('refuses to assign students or admins', async () => {
    const event = await liveEvent();
    const admin = await signedIn('admin');
    const student = await signedIn('student');
    const res = await admin.agent
      .put(`/api/admin/events/${event.id}/staff`)
      .send({ userIds: [student.user.id] });
    expect(res.status).toBe(400);
  });

  it('is admin only', async () => {
    const { agent } = await signedIn('staff');
    expect((await agent.get('/api/admin/staff')).status).toBe(403);
  });
});

describe('live updates', () => {
  let server: http.Server | undefined;
  afterEach(() => server?.close());

  it('streams each scan to everyone watching the event', async () => {
    const app = buildApp();
    const event = await liveEvent();
    const watcher = await signedIn('admin', app);
    const gate = await staffFor(event.id, app);
    const { payload } = await holder(event.id, app);

    // supertest can't hold a stream open, so listen on a real port and use node:http.
    server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    const login = await watcher.agent.get('/api/auth/me');
    const cookie = login.request.cookies;

    const firstUpdate = new Promise<string>((resolve, reject) => {
      const req = http.get(
        { port, path: `/api/gate/events/${event.id}/live`, headers: { cookie, origin: ORIGIN } },
        (res) => {
          expect(res.headers['content-type']).toBe('text/event-stream');
          let buffer = '';
          res.on('data', (chunk) => {
            buffer += chunk;
            const match = /event: update\ndata: (.+)\n\n/.exec(buffer);
            if (match) {
              resolve(match[1]!);
              req.destroy();
            }
          });
        },
      );
      req.on('error', reject);
    });

    // Give the stream a moment to subscribe, then scan.
    await new Promise((r) => setTimeout(r, 100));
    await scan(gate.agent, event.id, { payload, gate: 'Gate A' });

    const update = JSON.parse(await firstUpdate);
    expect(update.stats).toEqual({ checkedIn: 1, ticketsSold: 1, capacity: 100 });
    expect(update.scan).toMatchObject({ result: 'admitted', gate: 'Gate A' });
  });

  it('refuses the stream to staff who aren’t assigned', async () => {
    const event = await liveEvent();
    const { agent } = await signedIn('staff');
    expect((await agent.get(`/api/gate/events/${event.id}/live`)).status).toBe(403);
  });
});
