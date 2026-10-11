import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { comments, events, tickets } from '../src/db/schema';
import { memoryStorage } from '../src/lib/storage';
import { makeSlug } from '../src/modules/events/events.service';
import { browser, buildApp, db, signedIn, useTestDb } from './helpers';

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
      slug: makeSlug('social'),
      title: 'Spring Formal',
      category: 'party',
      venue: 'Great Hall',
      startsAt: new Date(Date.now() - HOUR),
      endsAt: new Date(Date.now() + 3 * HOUR),
      capacity: 100,
      status: 'published',
      ...values,
    })
    .returning();
  return row!;
}

async function holderOf(eventId: string, app = buildApp()) {
  const s = await signedIn('student', app);
  await db.insert(tickets).values({
    code: `MTH-${s.user.id.slice(0, 4).toUpperCase()}-PHTO`,
    eventId,
    userId: s.user.id,
    pricePaidCents: 0,
  });
  return s;
}

describe('event likes', () => {
  it('likes once, unlikes, and reports the count and my state', async () => {
    const event = await insertEvent();
    const a = await signedIn('student');
    const b = await signedIn('student');

    await a.agent.put(`/api/events/${event.id}/like`);
    const twice = await a.agent.put(`/api/events/${event.id}/like`);
    expect(twice.body).toEqual({ liked: true, likeCount: 1 });
    expect((await b.agent.put(`/api/events/${event.id}/like`)).body.likeCount).toBe(2);
    expect((await a.agent.delete(`/api/events/${event.id}/like`)).body).toEqual({
      liked: false,
      likeCount: 1,
    });

    const page = await b.agent.get(`/api/events/${event.slug}`);
    expect(page.body.event).toMatchObject({ likeCount: 1, likedByMe: true });
    const list = await browser().get('/api/events');
    expect(list.body.events[0].likeCount).toBe(1);
  });

  it('needs an account and an event that is on', async () => {
    const draft = await insertEvent({ status: 'draft' });
    const cancelled = await insertEvent({ status: 'cancelled' });
    expect((await browser().put(`/api/events/${draft.id}/like`)).status).toBe(401);
    const { agent } = await signedIn('student');
    expect((await agent.put(`/api/events/${draft.id}/like`)).status).toBe(404);
    expect((await agent.put(`/api/events/${cancelled.id}/like`)).status).toBe(409);
  });
});

describe('comments', () => {
  it('threads replies one level deep and shows authors by first name and initial', async () => {
    const event = await insertEvent();
    const { agent } = await signedIn('student');
    const root = (
      await agent.post(`/api/events/${event.id}/comments`).send({ body: 'Who’s going?' })
    ).body.comment;
    const reply = (
      await agent.post(`/api/events/${event.id}/comments`).send({ body: 'Me!', parentId: root.id })
    ).body.comment;
    await agent
      .post(`/api/events/${event.id}/comments`)
      .send({ body: 'Me too', parentId: reply.id });

    const res = await browser().get(`/api/events/${event.id}/comments`);
    expect(res.body.total).toBe(3);
    expect(res.body.comments).toHaveLength(1);
    expect(res.body.comments[0].author.name).toMatch(/^Test U\.$/);
    expect(res.body.comments[0].author).not.toHaveProperty('email');
    expect(res.body.comments[0].replies.map((r: { body: string }) => r.body)).toEqual([
      'Me!',
      'Me too',
    ]);
  });

  it('pages through threads newest first without skipping or repeating', async () => {
    const event = await insertEvent();
    const { agent } = await signedIn('student');
    for (let i = 0; i < 25; i++) {
      await agent.post(`/api/events/${event.id}/comments`).send({ body: `c${i}` });
    }
    const first = await browser().get(`/api/events/${event.id}/comments`);
    const second = await browser().get(
      `/api/events/${event.id}/comments?cursor=${first.body.nextCursor}`,
    );
    const bodies = [...first.body.comments, ...second.body.comments].map(
      (c: { body: string }) => c.body,
    );
    expect(bodies).toEqual(Array.from({ length: 25 }, (_, i) => `c${24 - i}`));
    expect(second.body.nextCursor).toBeNull();
  });

  it('lets the author edit, and the author or an admin delete', async () => {
    const event = await insertEvent();
    const author = await signedIn('student');
    const other = await signedIn('student');
    const admin = await signedIn('admin');
    const post = (body: string) =>
      author.agent.post(`/api/events/${event.id}/comments`).send({ body });
    const c1 = (await post('first')).body.comment;
    const c2 = (await post('second')).body.comment;

    expect((await other.agent.patch(`/api/comments/${c1.id}`).send({ body: 'x' })).status).toBe(
      403,
    );
    expect((await other.agent.delete(`/api/comments/${c1.id}`)).status).toBe(403);
    expect(
      (await author.agent.patch(`/api/comments/${c1.id}`).send({ body: 'edited' })).status,
    ).toBe(204);
    expect((await admin.agent.delete(`/api/comments/${c2.id}`)).status).toBe(204);

    const list = (await browser().get(`/api/events/${event.id}/comments`)).body;
    expect(list.comments.map((c: { body: string }) => c.body)).toEqual(['edited']);
    expect(list.comments[0].editedAt).not.toBeNull();
    const [row] = await db.select().from(comments).where(eq(comments.id, c2.id));
    expect(row!.body).toBe('');
  });

  it('keeps a deleted comment as a placeholder while it has replies', async () => {
    const event = await insertEvent();
    const { agent } = await signedIn('student');
    const root = (await agent.post(`/api/events/${event.id}/comments`).send({ body: 'root' })).body
      .comment;
    await agent.post(`/api/events/${event.id}/comments`).send({ body: 'reply', parentId: root.id });
    await agent.delete(`/api/comments/${root.id}`);

    const [thread] = (await browser().get(`/api/events/${event.id}/comments`)).body.comments;
    expect(thread).toMatchObject({ deleted: true, body: null, author: null });
    expect(thread.replies).toHaveLength(1);
  });

  it('rejects empty and overlong comments, and comments on cancelled events', async () => {
    const event = await insertEvent();
    const cancelled = await insertEvent({ status: 'cancelled' });
    const { agent } = await signedIn('student');
    expect(
      (await agent.post(`/api/events/${event.id}/comments`).send({ body: '   ' })).status,
    ).toBe(400);
    expect(
      (await agent.post(`/api/events/${event.id}/comments`).send({ body: 'x'.repeat(1001) }))
        .status,
    ).toBe(400);
    expect(
      (await agent.post(`/api/events/${cancelled.id}/comments`).send({ body: 'hi' })).status,
    ).toBe(409);
  });

  it('counts reactions per kind and marks mine', async () => {
    const event = await insertEvent();
    const a = await signedIn('student');
    const b = await signedIn('student');
    const c = (await a.agent.post(`/api/events/${event.id}/comments`).send({ body: 'hi' })).body
      .comment;

    await a.agent.put(`/api/comments/${c.id}/reactions/fire`);
    await a.agent.put(`/api/comments/${c.id}/reactions/fire`);
    await b.agent.put(`/api/comments/${c.id}/reactions/fire`);
    const res = await b.agent.put(`/api/comments/${c.id}/reactions/love`);
    expect(res.body.reactions).toEqual([
      { kind: 'love', count: 1, mine: true },
      { kind: 'fire', count: 2, mine: true },
    ]);

    const off = await b.agent.delete(`/api/comments/${c.id}/reactions/fire`);
    expect(off.body.reactions).toEqual([
      { kind: 'love', count: 1, mine: true },
      { kind: 'fire', count: 1, mine: false },
    ]);
    expect((await a.agent.put(`/api/comments/${c.id}/reactions/angry`)).status).toBe(400);
  });
});

describe('photo wall', () => {
  const upload = (
    agent: Awaited<ReturnType<typeof signedIn>>['agent'],
    eventId: string,
    caption = '',
  ) =>
    agent
      .post(`/api/events/${eventId}/photos`)
      .field('caption', caption)
      .attach('photo', PNG, { filename: 'p.png', contentType: 'image/png' });

  it('lets ticket holders post once the event has started', async () => {
    const storage = memoryStorage();
    const app = buildApp({ storage });
    const event = await insertEvent();
    const holder = await holderOf(event.id, app);

    const res = await upload(holder.agent, event.id, 'Dance floor!');
    expect(res.status).toBe(201);
    expect(storage.files.size).toBe(1);

    const wall = await holder.agent.get(`/api/events/${event.id}/photos`);
    expect(wall.body).toMatchObject({ canUpload: true, nextCursor: null });
    expect(wall.body.photos[0]).toMatchObject({ caption: 'Dance floor!', likeCount: 0 });
    expect(wall.body.photos[0].url).toMatch(/^\/api\/uploads\/photos\//);
  });

  it('stays closed before the start and to people without tickets', async () => {
    const later = await insertEvent({
      startsAt: new Date(Date.now() + 5 * HOUR),
      endsAt: new Date(Date.now() + 8 * HOUR),
    });
    const now = await insertEvent();
    const early = await holderOf(later.id);
    const stranger = await signedIn('student');

    expect((await upload(early.agent, later.id)).status).toBe(409);
    expect((await early.agent.get(`/api/events/${later.id}/photos`)).body.canUpload).toBe(false);
    expect((await upload(stranger.agent, now.id)).status).toBe(403);
    expect((await stranger.agent.get(`/api/events/${now.id}/photos`)).body.canUpload).toBe(false);
  });

  it('checks the bytes and caption length', async () => {
    const event = await insertEvent();
    const { agent } = await holderOf(event.id);
    const fake = await agent
      .post(`/api/events/${event.id}/photos`)
      .attach('photo', Buffer.from('not an image'), {
        filename: 'x.png',
        contentType: 'image/png',
      });
    expect(fake.status).toBe(400);
    expect((await upload(agent, event.id, 'x'.repeat(201))).status).toBe(400);
  });

  it('counts likes and lets the author or an admin delete', async () => {
    const storage = memoryStorage();
    const app = buildApp({ storage });
    const event = await insertEvent();
    const author = await holderOf(event.id, app);
    const fan = await signedIn('student', app);
    const admin = await signedIn('admin', app);
    await upload(author.agent, event.id);
    await upload(author.agent, event.id);
    const [p1, p2] = (await fan.agent.get(`/api/events/${event.id}/photos`)).body.photos;

    expect((await fan.agent.put(`/api/photos/${p1.id}/like`)).body).toEqual({
      liked: true,
      likeCount: 1,
    });
    expect((await fan.agent.delete(`/api/photos/${p1.id}`)).status).toBe(403);
    expect((await author.agent.delete(`/api/photos/${p1.id}`)).status).toBe(204);
    expect((await admin.agent.delete(`/api/photos/${p2.id}`)).status).toBe(204);
    expect(storage.files.size).toBe(0);
  });
});
