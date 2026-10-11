import {
  EVENT_PAGE_SIZE,
  type AdminEventListQuery,
  type EventListQuery,
  type EventStatus,
} from '@monthati/shared';
import { and, asc, desc, eq, gt, gte, ilike, lt, or, type SQL } from 'drizzle-orm';
import type { Executor } from '../../db/client';
import { events, type EventRow, type NewEventRow } from '../../db/schema';

const DAY_MS = 24 * 60 * 60 * 1000;

/** ILIKE pattern that treats the user's % and _ as literal characters. */
function containsPattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function textSearch(q: string | undefined) {
  if (!q) return undefined;
  const p = containsPattern(q);
  return or(ilike(events.title, p), ilike(events.venue, p), ilike(events.description, p));
}

export function eventsRepository(db: Executor) {
  return {
    /** Published events for Discover. Upcoming lists include events happening right now. */
    async listPublished({ q, category, price, when, page }: EventListQuery, now = new Date()) {
      const where: (SQL | undefined)[] = [eq(events.status, 'published'), textSearch(q)];
      if (category) where.push(eq(events.category, category));
      if (price === 'free') where.push(eq(events.priceCents, 0));
      if (price === 'paid') where.push(gt(events.priceCents, 0));

      if (when === 'past') {
        where.push(lt(events.endsAt, now));
      } else {
        where.push(gte(events.endsAt, now));
        const horizon = { 'this-week': 7, 'this-month': 30, upcoming: null }[when];
        if (horizon) where.push(lt(events.startsAt, new Date(now.getTime() + horizon * DAY_MS)));
      }

      // One extra row tells us whether there is a next page.
      const rows = await db
        .select()
        .from(events)
        .where(and(...where))
        .orderBy(when === 'past' ? desc(events.startsAt) : asc(events.startsAt), asc(events.id))
        .limit(EVENT_PAGE_SIZE + 1)
        .offset((page - 1) * EVENT_PAGE_SIZE);

      return {
        rows: rows.slice(0, EVENT_PAGE_SIZE),
        nextPage: rows.length > EVENT_PAGE_SIZE ? page + 1 : null,
      };
    },

    async listForAdmin({ q, status }: AdminEventListQuery) {
      return db
        .select()
        .from(events)
        .where(and(status ? eq(events.status, status) : undefined, textSearch(q)))
        .orderBy(desc(events.startsAt))
        .limit(200);
    },

    async findById(id: string) {
      const [row] = await db.select().from(events).where(eq(events.id, id));
      return row;
    },

    async findBySlug(slug: string) {
      const [row] = await db.select().from(events).where(eq(events.slug, slug));
      return row;
    },

    async insert(values: NewEventRow) {
      const [row] = await db.insert(events).values(values).returning();
      return row!;
    },

    async update(id: string, values: Partial<NewEventRow>) {
      const [row] = await db.update(events).set(values).where(eq(events.id, id)).returning();
      return row;
    },

    /**
     * Moves an event between statuses in one conditional UPDATE, so two admins
     * clicking at once can't both succeed. Returns undefined if `from` didn't match.
     */
    async transition(id: string, from: EventStatus, values: Partial<NewEventRow>) {
      const [row] = await db
        .update(events)
        .set(values)
        .where(and(eq(events.id, id), eq(events.status, from)))
        .returning();
      return row;
    },

    async deleteDraft(id: string): Promise<EventRow | undefined> {
      const [row] = await db
        .delete(events)
        .where(and(eq(events.id, id), eq(events.status, 'draft')))
        .returning();
      return row;
    },
  };
}

export type EventsRepository = ReturnType<typeof eventsRepository>;
