import { CANCEL_REASONS, LEDGER_KINDS, TICKET_STATUSES } from '@monthati/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { events } from './events';
import { users } from './users';

export const ticketStatusEnum = pgEnum('ticket_status', TICKET_STATUSES);
export const ticketCancelReasonEnum = pgEnum('ticket_cancel_reason', CANCEL_REASONS);
export const ledgerKindEnum = pgEnum('ledger_kind', LEDGER_KINDS);

export const tickets = pgTable(
  'tickets',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Short code for manual entry at the gate (MTH-7Q4K-29XD). */
    code: text().notNull().unique(),
    eventId: uuid()
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: ticketStatusEnum().notNull().default('valid'),
    /** What the holder actually paid, so refunds don't depend on today's price. */
    pricePaidCents: integer().notNull(),
    cancelReason: ticketCancelReasonEnum(),
    cancelledAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One active ticket per student per event, enforced by the database itself.
    uniqueIndex('tickets_one_active_per_user')
      .on(t.eventId, t.userId)
      .where(sql`${t.status} <> 'cancelled'`),
    index('tickets_user_idx').on(t.userId),
    index('tickets_event_status_idx').on(t.eventId, t.status),
    check('tickets_price_non_negative', sql`${t.pricePaidCents} >= 0`),
  ],
);

/**
 * Append-only money ledger. A wallet's balance is SUM(amount_cents) for its user;
 * it is never stored, so it can't drift from the history.
 */
export const walletLedger = pgTable(
  'wallet_ledger',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Positive = money in, negative = money out. Never zero. */
    amountCents: integer().notNull(),
    kind: ledgerKindEnum().notNull(),
    ticketId: uuid().references(() => tickets.id, { onDelete: 'restrict' }),
    /** Client-generated id for top-ups and withdrawals; makes retries safe. */
    requestId: uuid(),
    /** Payment provider reference for top-ups and withdrawals. */
    providerRef: text(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('wallet_ledger_user_created_idx').on(t.userId, t.createdAt),
    uniqueIndex('wallet_ledger_user_request_unique').on(t.userId, t.requestId),
    check('wallet_ledger_amount_non_zero', sql`${t.amountCents} <> 0`),
  ],
);

export type TicketRow = typeof tickets.$inferSelect;
export type LedgerRow = typeof walletLedger.$inferSelect;
