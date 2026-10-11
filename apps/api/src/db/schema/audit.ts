import { AUDIT_ACTIONS } from '@spu-events/shared';
import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const auditActionEnum = pgEnum('audit_action', AUDIT_ACTIONS);

/**
 * Append-only record of admin actions on accounts (suspensions, reinstatements,
 * wallet adjustments): who did what to whom, and why.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    action: auditActionEnum().notNull(),
    targetUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text().notNull(),
    amountCents: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_target_created_idx').on(t.targetUserId, t.createdAt)],
);

export type NewAuditRow = typeof auditLog.$inferInsert;
