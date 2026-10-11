import { EVENT_CATEGORIES, EVENT_STATUSES } from '@monthati/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const eventStatusEnum = pgEnum('event_status', EVENT_STATUSES);
export const eventCategoryEnum = pgEnum('event_category', EVENT_CATEGORIES);

export const events = pgTable(
  'events',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Stable public URL id ("spring-formal-7q4k"). Not changed when the title is edited. */
    slug: text().notNull().unique(),
    status: eventStatusEnum().notNull().default('draft'),
    title: text().notNull(),
    description: text().notNull().default(''),
    category: eventCategoryEnum().notNull(),
    venue: text().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    capacity: integer().notNull(),
    priceCents: integer().notNull().default(0),
    volunteersWanted: boolean().notNull().default(false),
    /** Storage key of the cover image, resolved to a URL by the storage service. */
    coverKey: text(),
    createdById: uuid().references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    cancellationReason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('events_status_starts_at_idx').on(t.status, t.startsAt),
    check('events_ends_after_start', sql`${t.endsAt} > ${t.startsAt}`),
    check('events_capacity_positive', sql`${t.capacity} > 0`),
    check('events_price_non_negative', sql`${t.priceCents} >= 0`),
  ],
);

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
