import { SCAN_RESULTS } from '@spu-events/shared';
import { index, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { events } from './events';
import { tickets } from './tickets';
import { users } from './users';

/** Which gate staff work which event. Admins can scan any event without a row here. */
export const eventStaff = pgTable(
  'event_staff',
  {
    eventId: uuid()
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.userId] }),
    index('event_staff_user_idx').on(t.userId),
  ],
);

export const scanResultEnum = pgEnum('scan_result', SCAN_RESULTS);

/** Every scan attempt, admitted or not: the gate's audit trail. */
export const scanLogs = pgTable(
  'scan_logs',
  {
    id: uuid().primaryKey().defaultRandom(),
    eventId: uuid()
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** Null when the scanned code didn't match any ticket. */
    ticketId: uuid().references(() => tickets.id, { onDelete: 'set null' }),
    staffId: uuid().references(() => users.id, { onDelete: 'set null' }),
    result: scanResultEnum().notNull(),
    gate: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('scan_logs_event_created_idx').on(t.eventId, t.createdAt)],
);
