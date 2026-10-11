import { randomUUID } from 'node:crypto';
import { formatCents } from '@spu-events/shared';
import { describe, expect, it } from 'vitest';
import { events, tickets } from '../src/db/schema';
import { toCsv } from '../src/lib/csv';
import { generateTicketCode } from '../src/lib/ticket-signing';
import { rangeStart } from '../src/modules/dashboard/dashboard.service';
import { makeSlug } from '../src/modules/events/events.service';
import { browser, buildApp, createUser, db, PASSWORD, signedIn, useTestDb } from './helpers';

useTestDb();

const HOUR = 60 * 60 * 1000;
type Agent = Awaited<ReturnType<typeof signedIn>>['agent'];

async function insertEvent(values: Partial<typeof events.$inferInsert> = {}) {
  const [row] = await db
    .insert(events)
    .values({
      slug: makeSlug('admin'),
      title: 'Jazz Night',
      category: 'music',
      venue: 'Great Hall',
      startsAt: new Date(Date.now() + 48 * HOUR),
      endsAt: new Date(Date.now() + 52 * HOUR),
      capacity: 100,
      priceCents: 5_000,
      status: 'published',
      ...values,
    })
    .returning();
  return row!;
}

const topUp = (agent: Agent, amountCents: number) =>
  agent.post('/api/wallet/top-ups').send({ amountCents, requestId: randomUUID() });

const adjust = (
  agent: Agent,
  userId: string,
  body: Partial<{ direction: string; amountCents: number; reason: string; requestId: string }>,
) =>
  agent.post(`/api/admin/users/${userId}/wallet-adjustments`).send({
    direction: 'credit',
    amountCents: 2_000,
    reason: 'Refund for the cancelled bus trip',
    requestId: randomUUID(),
    ...body,
  });

describe('admin users', () => {
  it('lists and searches users by name, email or student number, with filters', async () => {
    const { agent } = await signedIn('admin');
    const thandi = await createUser({ email: 'thandi@spu.ac.za' });
    await createUser({ role: 'staff', email: 'gate@spu.ac.za' });
    await createUser({ status: 'suspended' });

    const all = await agent.get('/api/admin/users');
    expect(all.body.total).toBe(4);
    expect(all.body.nextPage).toBeNull();

    const byEmail = await agent.get('/api/admin/users?q=THANDI');
    expect(byEmail.body.users.map((u: { id: string }) => u.id)).toEqual([thandi.id]);
    const byNumber = await agent.get(`/api/admin/users?q=${thandi.studentNumber}`);
    expect(byNumber.body.users).toHaveLength(1);
    // % is literal, not a wildcard.
    expect((await agent.get('/api/admin/users?q=%25')).body.total).toBe(0);

    expect((await agent.get('/api/admin/users?role=staff')).body.total).toBe(1);
    expect((await agent.get('/api/admin/users?status=suspended')).body.total).toBe(1);
    // Bad filters are ignored rather than failing the page.
    expect((await agent.get('/api/admin/users?role=wizard&page=-3')).body.total).toBe(4);
  });

  it('is for admins only', async () => {
    const { agent } = await signedIn('staff');
    expect((await agent.get('/api/admin/users')).status).toBe(403);
    expect((await browser().get('/api/admin/users')).status).toBe(401);
    expect((await agent.get('/api/admin/dashboard')).status).toBe(403);
  });

  it('suspends with a reason (signing them out) and reinstates, logging both', async () => {
    const app = buildApp();
    const admin = await signedIn('admin', app);
    const student = await signedIn('student', app);
    const id = student.user.id;

    const missing = await admin.agent.post(`/api/admin/users/${id}/suspend`).send({ reason: '' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.fields.reason).toBeDefined();

    const res = await admin.agent
      .post(`/api/admin/users/${id}/suspend`)
      .send({ reason: 'Selling tickets on WhatsApp' });
    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe('suspended');
    expect((await student.agent.get('/api/auth/me')).body.user).toBeNull();
    const login = await browser(app)
      .post('/api/auth/login')
      .send({ identifier: student.user.email, password: PASSWORD });
    expect(login.status).not.toBe(200);

    const twice = await admin.agent
      .post(`/api/admin/users/${id}/suspend`)
      .send({ reason: 'Selling tickets on WhatsApp' });
    expect(twice.status).toBe(409);

    const back = await admin.agent
      .post(`/api/admin/users/${id}/reinstate`)
      .send({ reason: 'Spoke to them; first offence' });
    expect(back.body.user.status).toBe('active');
    expect(back.body.user.history.map((h: { action: string }) => h.action)).toEqual([
      'user_reinstated',
      'user_suspended',
    ]);
    expect(back.body.user.history[1]).toMatchObject({
      reason: 'Selling tickets on WhatsApp',
      actorName: `${admin.user.firstName} ${admin.user.lastName}`,
    });

    const again = browser(app);
    await again
      .post('/api/auth/login')
      .send({ identifier: student.user.email, password: PASSWORD });
    const titles = (await again.get('/api/notifications')).body.notifications.map(
      (n: { title: string }) => n.title,
    );
    expect(titles).toEqual([
      'Welcome back: your account is active again',
      'Your account was suspended',
    ]);
  });

  it('won’t suspend an admin or yourself', async () => {
    const { agent, user } = await signedIn('admin');
    const other = await createUser({ role: 'admin' });
    const body = { reason: 'Testing the rules' };
    expect((await agent.post(`/api/admin/users/${user.id}/suspend`).send(body)).status).toBe(403);
    expect((await agent.post(`/api/admin/users/${other.id}/suspend`).send(body)).status).toBe(403);
    const staff = await createUser({ role: 'staff' });
    expect((await agent.post(`/api/admin/users/${staff.id}/suspend`).send(body)).status).toBe(200);
  });

  it('credits and debits a wallet with a logged reason, once per request id', async () => {
    const admin = await signedIn('admin');
    const student = await signedIn('student');
    const id = student.user.id;

    const requestId = randomUUID();
    const credit = await adjust(admin.agent, id, { requestId });
    expect(credit.body.user.balanceCents).toBe(2_000);
    // A double-submit changes nothing.
    expect((await adjust(admin.agent, id, { requestId })).body.user.balanceCents).toBe(2_000);

    const overdraw = await adjust(admin.agent, id, { direction: 'debit', amountCents: 2_001 });
    expect(overdraw.status).toBe(409);
    expect(overdraw.body.error.code).toBe('INSUFFICIENT_FUNDS');

    const debit = await adjust(admin.agent, id, {
      direction: 'debit',
      amountCents: 500,
      reason: 'Duplicate credit corrected',
    });
    expect(debit.body.user.balanceCents).toBe(1_500);
    expect(debit.body.user.history[0]).toMatchObject({
      action: 'wallet_adjusted',
      amountCents: -500,
      reason: 'Duplicate credit corrected',
    });

    // The student sees the reason in their wallet and inbox.
    const wallet = (await student.agent.get('/api/wallet')).body;
    expect(wallet.balanceCents).toBe(1_500);
    expect(wallet.entries[0]).toMatchObject({
      kind: 'adjustment',
      description: 'Duplicate credit corrected',
    });
    const inbox = (await student.agent.get('/api/notifications')).body.notifications;
    expect(inbox[0]).toMatchObject({
      title: `${formatCents(500)} taken from your wallet`,
      link: '/wallet',
    });
  });

  it('only adjusts student wallets', async () => {
    const { agent } = await signedIn('admin');
    const staff = await createUser({ role: 'staff' });
    expect((await adjust(agent, staff.id, {})).status).toBe(400);
    expect((await adjust(agent, randomUUID(), {})).status).toBe(404);
  });

  it('shows a student’s tickets and activity', async () => {
    const admin = await signedIn('admin');
    const student = await signedIn('student');
    const event = await insertEvent();
    await topUp(student.agent, 10_000);
    await student.agent.post(`/api/events/${event.id}/tickets`);

    const { user } = (await admin.agent.get(`/api/admin/users/${student.user.id}`)).body;
    expect(user).toMatchObject({
      balanceCents: 5_000,
      stats: { activeTickets: 1, attended: 0, comments: 0, reportsAgainst: 0 },
    });
    expect(user.tickets[0].event.title).toBe('Jazz Night');
    expect(user.ledger.map((e: { kind: string }) => e.kind)).toEqual(['ticket_purchase', 'top_up']);
    expect(user).not.toHaveProperty('passwordHash');
  });
});

describe('dashboard', () => {
  it('counts revenue net of refunds, tickets, check-in rate and active students', async () => {
    const admin = await signedIn('admin');
    const a = await signedIn('student');
    const b = await signedIn('student');
    const upcoming = await insertEvent({ category: 'music' });
    for (const s of [a, b]) {
      await topUp(s.agent, 10_000);
      await s.agent.post(`/api/events/${upcoming.id}/tickets`);
    }
    // b changes their mind: refunded, so neither the ticket nor the money counts.
    const bTicket = (await b.agent.get('/api/tickets')).body.tickets[0];
    await b.agent.post(`/api/tickets/${bTicket.id}/cancel`);

    // An event that ended yesterday: 1 of 2 holders came.
    const past = await insertEvent({
      title: 'Derby Day',
      category: 'sport',
      startsAt: new Date(Date.now() - 28 * HOUR),
      endsAt: new Date(Date.now() - 24 * HOUR),
      priceCents: 0,
    });
    const holders = [await createUser(), await createUser()];
    await db.insert(tickets).values([
      {
        eventId: past.id,
        userId: holders[0]!.id,
        code: generateTicketCode(),
        pricePaidCents: 0,
        status: 'used',
        createdAt: new Date(Date.now() - 72 * HOUR),
      },
      {
        eventId: past.id,
        userId: holders[1]!.id,
        code: generateTicketCode(),
        pricePaidCents: 0,
        createdAt: new Date(Date.now() - 72 * HOUR),
      },
    ]);
    await insertEvent({ status: 'draft' });

    const res = await admin.agent.get('/api/admin/dashboard?range=7d');
    expect(res.status).toBe(200);
    const d = res.body.dashboard;
    expect(d.kpis).toEqual({
      revenueCents: { value: 5_000, previous: 0 },
      ticketsSold: { value: 3, previous: 0 },
      checkInRate: { value: 0.5, previous: null },
      activeStudents: { value: 4, previous: 0 },
    });
    expect(d.daily).toHaveLength(7);
    expect(d.daily.at(-1)).toEqual({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      tickets: 1,
      revenueCents: 5_000,
    });
    expect(d.byCategory).toEqual([
      { category: 'sport', tickets: 2 },
      { category: 'music', tickets: 1 },
    ]);
    expect(d.topEvents.map((e: { title: string }) => e.title)).toEqual(['Derby Day', 'Jazz Night']);
    expect(d.topEvents[1]).toMatchObject({
      title: 'Jazz Night',
      ticketsSold: 1,
      revenueCents: 5_000,
      startsAt: upcoming.startsAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    });
    expect(d.attention).toEqual({ openReports: 0, pendingVolunteers: 0, draftEvents: 1 });
  });

  it('starts ranges at campus midnight', () => {
    // 01:30 SAST on 11 Oct is still 23:30 UTC on 10 Oct.
    const now = new Date('2026-10-10T23:30:00Z');
    expect(rangeStart(1, now).toISOString()).toBe('2026-10-10T22:00:00.000Z');
    expect(rangeStart(7, now).toISOString()).toBe('2026-10-04T22:00:00.000Z');
  });
});

describe('attendees', () => {
  it('lists active ticket holders and exports them as CSV', async () => {
    const admin = await signedIn('admin');
    const student = await signedIn('student');
    const event = await insertEvent({ title: 'Jazz Night: Live!', priceCents: 0 });
    await student.agent.post(`/api/events/${event.id}/tickets`);

    const list = await admin.agent.get(`/api/admin/events/${event.id}/attendees`);
    expect(list.body.attendees).toHaveLength(1);
    expect(list.body.attendees[0]).toMatchObject({
      name: `${student.user.firstName} ${student.user.lastName}`,
      studentNumber: student.user.studentNumber,
      status: 'valid',
    });

    const csv = await admin.agent.get(`/api/admin/events/${event.id}/attendees.csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/^text\/csv/);
    expect(csv.headers['content-disposition']).toContain('jazz-night-live-attendees.csv');
    const lines = csv.text
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    expect(lines[0]).toBe('Name,Student number,Email,Ticket code,Paid (R),Bought,Checked in,Gate');
    expect(lines[1]).toContain(student.user.email);

    expect((await student.agent.get(`/api/admin/events/${event.id}/attendees`)).status).toBe(403);
    expect((await admin.agent.get(`/api/admin/events/${randomUUID()}/attendees`)).status).toBe(404);
  });

  it('escapes CSV and defuses spreadsheet formulas', () => {
    expect(
      toCsv(
        ['a', 'b'],
        [
          ['=HYPERLINK("x")', 'Smith, J'],
          [null, 3],
        ],
      ),
    ).toBe('a,b\r\n"\'=HYPERLINK(""x"")","Smith, J"\r\n,3\r\n');
  });
});
