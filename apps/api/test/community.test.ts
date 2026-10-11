import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { comments, events, notifications } from '../src/db/schema';
import { memoryStorage } from '../src/lib/storage';
import { makeSlug } from '../src/modules/events/events.service';
import { browser, buildApp, db, PASSWORD, signedIn, useTestDb } from './helpers';

useTestDb();

const HOUR = 60 * 60 * 1000;
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);

async function insertEvent(values: Partial<typeof events.$inferInsert> = {}) {
  const [row] = await db
    .insert(events)
    .values({
      slug: makeSlug('community'),
      title: 'Careers Expo',
      category: 'career',
      venue: 'Moroka Hall',
      startsAt: new Date(Date.now() + 48 * HOUR),
      endsAt: new Date(Date.now() + 54 * HOUR),
      capacity: 100,
      priceCents: 0,
      volunteersWanted: true,
      status: 'published',
      ...values,
    })
    .returning();
  return row!;
}

type Agent = Awaited<ReturnType<typeof signedIn>>['agent'];
const inbox = async (agent: Agent) => (await agent.get('/api/notifications')).body;

describe('volunteering', () => {
  const apply = (agent: Agent, eventId: string) =>
    agent
      .post(`/api/events/${eventId}/volunteer`)
      .send({ role: 'Usher', motivation: 'I helped at last year’s expo.' });

  it('lets a student apply once, see the application and withdraw it', async () => {
    const event = await insertEvent();
    const { agent } = await signedIn('student');

    expect((await agent.get(`/api/events/${event.id}/volunteer`)).body.application).toBeNull();
    expect((await apply(agent, event.id)).status).toBe(201);
    expect((await apply(agent, event.id)).status).toBe(409);
    expect((await agent.get(`/api/events/${event.id}/volunteer`)).body.application).toMatchObject({
      role: 'Usher',
      status: 'pending',
    });

    const withdrawn = await agent.delete(`/api/events/${event.id}/volunteer`);
    expect(withdrawn.body.application.status).toBe('withdrawn');
    // Withdrawn applications don't block a fresh one.
    expect((await apply(agent, event.id)).status).toBe(201);
  });

  it('only accepts applications for events that want volunteers', async () => {
    const noHelp = await insertEvent({ volunteersWanted: false });
    const { agent } = await signedIn('student');
    expect((await apply(agent, noHelp.id)).status).toBe(409);
    const staff = await signedIn('staff');
    expect((await apply(staff.agent, (await insertEvent()).id)).status).toBe(403);
  });

  it('lets admins decide one or all, and tells each student', async () => {
    const event = await insertEvent();
    const admin = await signedIn('admin');
    const a = await signedIn('student');
    const b = await signedIn('student');
    const c = await signedIn('student');
    for (const s of [a, b, c]) await apply(s.agent, event.id);

    const list = await admin.agent.get(`/api/admin/events/${event.id}/volunteers?status=pending`);
    expect(list.body.applicants).toHaveLength(3);
    expect(list.body.applicants[0].student).toHaveProperty('email');

    const first = list.body.applicants[0].id;
    await admin.agent.post(`/api/admin/volunteers/${first}/decision`).send({ decision: 'accept' });
    const again = await admin.agent
      .post(`/api/admin/volunteers/${first}/decision`)
      .send({ decision: 'decline' });
    expect(again.status).toBe(409);

    const rest = await admin.agent
      .post(`/api/admin/events/${event.id}/volunteers/decide-all`)
      .send({ decision: 'decline' });
    expect(rest.body).toEqual({ decided: 2 });

    expect((await inbox(a.agent)).notifications[0]).toMatchObject({
      kind: 'volunteer_accepted',
      title: 'You’re volunteering at Careers Expo',
    });
    expect((await inbox(c.agent)).notifications[0].kind).toBe('volunteer_declined');
  });

  it('keeps the volunteer list from students', async () => {
    const event = await insertEvent();
    const { agent } = await signedIn('student');
    expect((await agent.get(`/api/admin/events/${event.id}/volunteers`)).status).toBe(403);
  });
});

describe('reports and moderation', () => {
  async function commentBy(
    agent: Agent,
    eventId: string,
    body = 'Buy cheap followers at spam.example',
  ) {
    return (await agent.post(`/api/events/${eventId}/comments`).send({ body })).body.comment
      .id as string;
  }
  const report = (agent: Agent, targetId: string, reason = 'spam', targetType = 'comment') =>
    agent.post('/api/reports').send({ targetType, targetId, reason });

  it('groups reports per post and ignores duplicates from the same person', async () => {
    const event = await insertEvent();
    const author = await signedIn('student');
    const r1 = await signedIn('student');
    const r2 = await signedIn('student');
    const admin = await signedIn('admin');
    const id = await commentBy(author.agent, event.id);

    await report(r1.agent, id);
    expect((await report(r1.agent, id)).status).toBe(201);
    await report(r2.agent, id, 'harassment');

    const queue = (await admin.agent.get('/api/admin/moderation')).body.items;
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      targetType: 'comment',
      text: 'Buy cheap followers at spam.example',
    });
    expect(queue[0].reports.map((r: { reason: string }) => r.reason)).toEqual([
      'spam',
      'harassment',
    ]);
    expect((await admin.agent.get('/api/admin/moderation/count')).body.count).toBe(1);
  });

  it('won’t let you report your own post or a post that’s gone', async () => {
    const event = await insertEvent();
    const { agent } = await signedIn('student');
    const id = await commentBy(agent, event.id);
    expect((await report(agent, id)).status).toBe(400);
    expect((await report(agent, randomUUID())).status).toBe(404);
  });

  it('asks for details when the reason is "other"', async () => {
    const event = await insertEvent();
    const author = await signedIn('student');
    const { agent } = await signedIn('student');
    const id = await commentBy(author.agent, event.id);
    const res = await report(agent, id, 'other');
    expect(res.body.error.fields).toHaveProperty('details');
  });

  it('removes and warns: content gone, author and reporters told, queue cleared', async () => {
    const event = await insertEvent();
    const author = await signedIn('student');
    const reporter = await signedIn('student');
    const admin = await signedIn('admin');
    const id = await commentBy(author.agent, event.id);
    await report(reporter.agent, id);

    const res = await admin.agent
      .post(`/api/admin/moderation/comment/${id}`)
      .send({ action: 'remove_and_warn', note: 'No advertising, please.' });
    expect(res.status).toBe(200);

    const [row] = await db.select().from(comments).where(eq(comments.id, id));
    expect(row!.deletedAt).not.toBeNull();
    const authorInbox = (await inbox(author.agent)).notifications.map(
      (n: { kind: string }) => n.kind,
    );
    expect(authorInbox.sort()).toEqual(['account_warning', 'content_removed']);
    expect(
      (await inbox(author.agent)).notifications.find(
        (n: { kind: string }) => n.kind === 'content_removed',
      ).body,
    ).toMatch(/No advertising, please\./);
    expect((await inbox(reporter.agent)).notifications[0]).toMatchObject({
      kind: 'report_resolved',
      title: 'Thanks for your report',
    });
    expect((await admin.agent.get('/api/admin/moderation')).body.items).toHaveLength(0);
    expect(
      (await admin.agent.post(`/api/admin/moderation/comment/${id}`).send({ action: 'remove' }))
        .status,
    ).toBe(404);
  });

  it('dismissing keeps the post and tells the reporter it was fine', async () => {
    const event = await insertEvent();
    const author = await signedIn('student');
    const reporter = await signedIn('student');
    const admin = await signedIn('admin');
    const id = await commentBy(author.agent, event.id, 'Is there parking?');
    await report(reporter.agent, id, 'harassment');

    await admin.agent.post(`/api/admin/moderation/comment/${id}`).send({ action: 'dismiss' });
    const [row] = await db.select().from(comments).where(eq(comments.id, id));
    expect(row!.deletedAt).toBeNull();
    expect((await inbox(author.agent)).notifications).toHaveLength(0);
    expect((await inbox(reporter.agent)).notifications[0].title).toBe('We reviewed your report');
  });

  it('suspending signs the author out at once and removes reported photos', async () => {
    const storage = memoryStorage();
    const app = buildApp({ storage });
    // Free event already under way, so the photo wall is open.
    const event = await insertEvent({ startsAt: new Date(Date.now() - HOUR) });
    const poster = await signedIn('student', app);
    const reporter = await signedIn('student', app);
    const admin = await signedIn('admin', app);

    expect((await poster.agent.post(`/api/events/${event.id}/tickets`)).status).toBe(201);
    const posted = await poster.agent
      .post(`/api/events/${event.id}/photos`)
      .attach('photo', PNG, { filename: 'p.png', contentType: 'image/png' });
    expect(posted.status).toBe(201);

    await report(reporter.agent, posted.body.id, 'inappropriate', 'photo');
    await admin.agent
      .post(`/api/admin/moderation/photo/${posted.body.id}`)
      .send({ action: 'remove_and_suspend' });

    expect(storage.files.size).toBe(0);
    expect((await poster.agent.get('/api/auth/me')).body.user).toBeNull();
    const login = await browser(app)
      .post('/api/auth/login')
      .send({ identifier: poster.user.email, password: PASSWORD });
    expect(login.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('keeps the queue for admins only', async () => {
    const { agent } = await signedIn('staff');
    expect((await agent.get('/api/admin/moderation')).status).toBe(403);
  });
});

describe('notifications', () => {
  it('announce tickets, refunds, event changes and cancellations', async () => {
    const admin = await signedIn('admin');
    const created = await admin.agent.post('/api/admin/events').send({
      title: 'Jazz Night',
      category: 'music',
      venue: 'Great Hall',
      startsAt: new Date(Date.now() + 72 * HOUR).toISOString(),
      endsAt: new Date(Date.now() + 75 * HOUR).toISOString(),
      capacity: 50,
      priceCents: 0,
    });
    const event = created.body.event;
    await admin.agent.post(`/api/admin/events/${event.id}/publish`);

    const { agent } = await signedIn('student');
    const ticket = (await agent.post(`/api/events/${event.id}/tickets`)).body.ticket;
    expect((await inbox(agent)).notifications[0]).toMatchObject({
      kind: 'ticket_issued',
      title: 'You’re going to Jazz Night',
      link: `/tickets/${ticket.id}`,
      read: false,
    });

    // A description edit is quiet; moving the venue is announced.
    const body = (changes: object) => ({
      title: 'Jazz Night',
      category: 'music',
      venue: 'Great Hall',
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      capacity: 50,
      priceCents: 0,
      ...changes,
    });
    await admin.agent
      .put(`/api/admin/events/${event.id}`)
      .send(body({ description: 'Bring friends' }));
    expect((await inbox(agent)).notifications).toHaveLength(1);
    await admin.agent.put(`/api/admin/events/${event.id}`).send(body({ venue: 'Central Lawn' }));
    expect((await inbox(agent)).notifications[0]).toMatchObject({
      kind: 'event_changed',
      body: expect.stringContaining('Central Lawn'),
    });

    await admin.agent
      .post(`/api/admin/events/${event.id}/cancel`)
      .send({ reason: 'Storm warning.' });
    expect((await inbox(agent)).notifications[0]).toMatchObject({
      kind: 'event_cancelled',
      title: 'Jazz Night is cancelled',
      body: 'Storm warning.',
    });
    expect((await inbox(agent)).unreadCount).toBe(3);
  });

  it('marks one or all as read, and only my own', async () => {
    const event = await insertEvent();
    const me = await signedIn('student');
    const other = await signedIn('student');
    await me.agent.post(`/api/events/${event.id}/tickets`);
    await me.agent.post(`/api/events/${(await insertEvent()).id}/tickets`);
    await other.agent.post(`/api/events/${event.id}/tickets`);

    const [first] = (await inbox(me.agent)).notifications;
    const theirs = (await inbox(other.agent)).notifications[0].id;

    const one = await me.agent.post('/api/notifications/read').send({ ids: [first.id, theirs] });
    expect(one.body.unreadCount).toBe(1);
    expect((await other.agent.get('/api/notifications/unread-count')).body.unreadCount).toBe(1);

    await me.agent.post('/api/notifications/read').send({});
    expect((await me.agent.get('/api/notifications/unread-count')).body.unreadCount).toBe(0);
    expect(await db.select().from(notifications)).toHaveLength(3);
  });

  it('needs an account', async () => {
    expect((await browser().get('/api/notifications')).status).toBe(401);
  });
});
