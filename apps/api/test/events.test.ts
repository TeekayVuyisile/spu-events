import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { events } from '../src/db/schema';
import { memoryStorage } from '../src/lib/storage';
import { makeSlug } from '../src/modules/events/events.service';
import { browser, buildApp, db, signedIn, useTestDb } from './helpers';

useTestDb();

const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number, hours = 0) =>
  new Date(Date.now() + days * DAY + hours * 3600_000).toISOString();

const input = (overrides: object = {}) => ({
  title: 'Spring Formal',
  description: 'Black tie. Live DJ.',
  category: 'party',
  venue: 'Great Hall',
  startsAt: inDays(7),
  endsAt: inDays(7, 4),
  capacity: 300,
  priceCents: 15000,
  volunteersWanted: true,
  ...overrides,
});

// Smallest valid PNG header bytes; enough for the type check.
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);

async function admin(app = buildApp()) {
  return (await signedIn('admin', app)).agent;
}

async function createEvent(agent: Awaited<ReturnType<typeof admin>>, overrides: object = {}) {
  const res = await agent.post('/api/admin/events').send(input(overrides));
  expect(res.status).toBe(201);
  return res.body.event;
}

async function published(agent: Awaited<ReturnType<typeof admin>>, overrides: object = {}) {
  const event = await createEvent(agent, overrides);
  const res = await agent.post(`/api/admin/events/${event.id}/publish`);
  expect(res.status).toBe(200);
  return res.body.event;
}

/** Inserts straight into the DB, for states the API won't create (events in the past). */
async function insertEvent(values: Partial<typeof events.$inferInsert>) {
  const [row] = await db
    .insert(events)
    .values({
      slug: makeSlug('seeded'),
      title: 'Seeded',
      category: 'other',
      venue: 'Hall',
      startsAt: new Date(inDays(-3)),
      endsAt: new Date(inDays(-3, 2)),
      capacity: 10,
      status: 'published',
      ...values,
    })
    .returning();
  return row!;
}

describe('admin event access', () => {
  it('is closed to everyone but admins', async () => {
    expect((await browser().get('/api/admin/events')).status).toBe(401);
    const { agent } = await signedIn('student');
    expect((await agent.post('/api/admin/events').send(input())).status).toBe(403);
  });
});

describe('creating and editing', () => {
  it('creates a draft with a readable slug', async () => {
    const event = await createEvent(await admin());
    expect(event).toMatchObject({ status: 'draft', priceCents: 15000, coverUrl: null });
    expect(event.slug).toMatch(/^spring-formal-[a-f0-9]{4}$/);
  });

  it('rejects a start in the past and an end before the start', async () => {
    const agent = await admin();
    const past = await agent.post('/api/admin/events').send(input({ startsAt: inDays(-1) }));
    expect(past.status).toBe(400);
    expect(past.body.error.fields).toHaveProperty('startsAt');

    const backwards = await agent.post('/api/admin/events').send(input({ endsAt: inDays(6) }));
    expect(backwards.body.error.fields).toHaveProperty('endsAt');
  });

  it('updates an event but keeps its slug', async () => {
    const agent = await admin();
    const event = await createEvent(agent);
    const res = await agent
      .put(`/api/admin/events/${event.id}`)
      .send(input({ title: 'Winter Formal', capacity: 500 }));
    expect(res.body.event).toMatchObject({
      title: 'Winter Formal',
      capacity: 500,
      slug: event.slug,
    });
  });

  it('returns 404 for an unknown event and 400 for a bad id', async () => {
    const agent = await admin();
    expect((await agent.get(`/api/admin/events/${randomUUID()}`)).status).toBe(404);
    expect((await agent.get('/api/admin/events/not-a-uuid')).status).toBe(400);
  });
});

describe('status changes', () => {
  it('publishes, unpublishes and cancels', async () => {
    const agent = await admin();
    const event = await published(agent);
    expect(event.status).toBe('published');
    expect(event.publishedAt).not.toBeNull();

    const draft = await agent.post(`/api/admin/events/${event.id}/unpublish`);
    expect(draft.body.event.status).toBe('draft');

    await agent.post(`/api/admin/events/${event.id}/publish`);
    const cancelled = await agent
      .post(`/api/admin/events/${event.id}/cancel`)
      .send({ reason: 'Venue flooded' });
    expect(cancelled.body.event).toMatchObject({
      status: 'cancelled',
      cancellationReason: 'Venue flooded',
    });
  });

  it('refuses changes that make no sense for the current status', async () => {
    const agent = await admin();
    const event = await published(agent);

    expect((await agent.post(`/api/admin/events/${event.id}/publish`)).status).toBe(409);
    expect((await agent.delete(`/api/admin/events/${event.id}`)).status).toBe(409);

    await agent.post(`/api/admin/events/${event.id}/cancel`).send({ reason: 'Venue flooded' });
    expect((await agent.put(`/api/admin/events/${event.id}`).send(input())).status).toBe(409);
    expect((await agent.post(`/api/admin/events/${event.id}/unpublish`)).status).toBe(409);
  });

  it('requires a reason to cancel', async () => {
    const agent = await admin();
    const event = await published(agent);
    const res = await agent.post(`/api/admin/events/${event.id}/cancel`).send({ reason: '' });
    expect(res.body.error.fields).toHaveProperty('reason');
  });

  it('deletes drafts', async () => {
    const agent = await admin();
    const event = await createEvent(agent);
    expect((await agent.delete(`/api/admin/events/${event.id}`)).status).toBe(204);
    expect((await agent.get(`/api/admin/events/${event.id}`)).status).toBe(404);
  });

  it('duplicates into a new draft', async () => {
    const agent = await admin();
    const event = await published(agent);
    const res = await agent.post(`/api/admin/events/${event.id}/duplicate`);
    expect(res.status).toBe(201);
    expect(res.body.event).toMatchObject({ status: 'draft', title: 'Spring Formal (copy)' });
    expect(res.body.event.slug).not.toBe(event.slug);
  });
});

describe('cover images', () => {
  it('stores a real image and replaces the old one', async () => {
    const storage = memoryStorage();
    const agent = await admin(buildApp({ storage }));
    const event = await createEvent(agent);

    const first = await agent
      .put(`/api/admin/events/${event.id}/cover`)
      .attach('cover', PNG, { filename: 'cover.png', contentType: 'image/png' });
    expect(first.status).toBe(200);
    expect(first.body.event.coverUrl).toMatch(/^\/api\/uploads\/events\/.+\.png$/);

    const second = await agent
      .put(`/api/admin/events/${event.id}/cover`)
      .attach('cover', PNG, { filename: 'again.png', contentType: 'image/png' });
    expect(second.body.event.coverUrl).not.toBe(first.body.event.coverUrl);
    expect(storage.files.size).toBe(1);

    await agent.delete(`/api/admin/events/${event.id}/cover`);
    expect(storage.files.size).toBe(0);
  });

  it('checks the bytes, not the file name', async () => {
    const agent = await admin();
    const event = await createEvent(agent);
    const res = await agent
      .put(`/api/admin/events/${event.id}/cover`)
      .attach('cover', Buffer.from('<script>alert(1)</script>'), {
        filename: 'evil.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('cover');
  });

  it('rejects files over 5 MB', async () => {
    const agent = await admin();
    const event = await createEvent(agent);
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await agent
      .put(`/api/admin/events/${event.id}/cover`)
      .attach('cover', big, { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(413);
  });

  it('copies the cover when duplicating', async () => {
    const storage = memoryStorage();
    const agent = await admin(buildApp({ storage }));
    const event = await createEvent(agent);
    await agent
      .put(`/api/admin/events/${event.id}/cover`)
      .attach('cover', PNG, { filename: 'cover.png', contentType: 'image/png' });

    const copy = await agent.post(`/api/admin/events/${event.id}/duplicate`);
    expect(storage.files.size).toBe(2);
    await agent.delete(`/api/admin/events/${copy.body.event.id}`);
    expect(storage.files.size).toBe(1);
  });
});

describe('public listing', () => {
  it('shows only published events that haven’t ended, soonest first', async () => {
    const agent = await admin();
    await createEvent(agent, { title: 'Secret draft' });
    await published(agent, { title: 'Later', startsAt: inDays(20), endsAt: inDays(20, 3) });
    await published(agent, { title: 'Sooner', startsAt: inDays(2), endsAt: inDays(2, 3) });
    await insertEvent({ title: 'Last week' });
    await insertEvent({
      title: 'Cancelled',
      status: 'cancelled',
      startsAt: new Date(inDays(5)),
      endsAt: new Date(inDays(5, 1)),
    });

    const res = await browser().get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.events.map((e: { title: string }) => e.title)).toEqual(['Sooner', 'Later']);
    expect(res.body.nextPage).toBeNull();
    expect(res.body.events[0]).not.toHaveProperty('description');
  });

  it('includes an event that is happening right now', async () => {
    await insertEvent({
      title: 'Live now',
      startsAt: new Date(inDays(0, -1)),
      endsAt: new Date(inDays(0, 2)),
    });
    const res = await browser().get('/api/events');
    expect(res.body.events.map((e: { title: string }) => e.title)).toEqual(['Live now']);
  });

  it('filters by search, category, price and date', async () => {
    const agent = await admin();
    await published(agent, {
      title: 'Jazz Night',
      category: 'music',
      priceCents: 0,
      startsAt: inDays(3),
      endsAt: inDays(3, 2),
    });
    await published(agent, {
      title: 'Career Fair',
      category: 'career',
      priceCents: 0,
      venue: 'Jazz Café',
      startsAt: inDays(20),
      endsAt: inDays(20, 2),
    });
    await published(agent, {
      title: 'Derby Day',
      category: 'sport',
      priceCents: 5000,
      startsAt: inDays(4),
      endsAt: inDays(4, 2),
    });
    await insertEvent({ title: 'Old Jazz' });

    const titles = async (qs: string) =>
      (await browser().get(`/api/events?${qs}`)).body.events.map((e: { title: string }) => e.title);

    expect(await titles('q=jazz')).toEqual(['Jazz Night', 'Career Fair']);
    expect(await titles('q=%25')).toEqual([]);
    expect(await titles('category=sport')).toEqual(['Derby Day']);
    expect(await titles('price=free')).toEqual(['Jazz Night', 'Career Fair']);
    expect(await titles('price=paid')).toEqual(['Derby Day']);
    expect(await titles('when=this-week')).toEqual(['Jazz Night', 'Derby Day']);
    expect(await titles('when=past&q=jazz')).toEqual(['Old Jazz']);
  });

  it('pages through results', async () => {
    for (let i = 0; i < 26; i++) {
      await insertEvent({
        title: `E${i}`,
        startsAt: new Date(inDays(1 + i)),
        endsAt: new Date(inDays(1 + i, 1)),
      });
    }
    const first = await browser().get('/api/events');
    expect(first.body.events).toHaveLength(24);
    expect(first.body.nextPage).toBe(2);
    const second = await browser().get('/api/events?page=2');
    expect(second.body.events.map((e: { title: string }) => e.title)).toEqual(['E24', 'E25']);
    expect(second.body.nextPage).toBeNull();
  });
});

describe('public event page', () => {
  it('shows published and cancelled events, hides drafts', async () => {
    const agent = await admin();
    const draft = await createEvent(agent);
    const live = await published(agent);

    expect((await browser().get(`/api/events/${draft.slug}`)).status).toBe(404);

    const res = await browser().get(`/api/events/${live.slug}`);
    expect(res.body.event).toMatchObject({
      title: 'Spring Formal',
      description: 'Black tie. Live DJ.',
      volunteersWanted: true,
    });
    expect(res.body.event).not.toHaveProperty('createdAt');

    await agent.post(`/api/admin/events/${live.id}/cancel`).send({ reason: 'Venue flooded' });
    const cancelled = await browser().get(`/api/events/${live.slug}`);
    expect(cancelled.body.event).toMatchObject({
      status: 'cancelled',
      cancellationReason: 'Venue flooded',
    });
  });
});
