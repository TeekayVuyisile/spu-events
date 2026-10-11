import { sql } from 'drizzle-orm';
import { check, index, json, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { roleEnum, users } from './users';

/** Session rows owned by connect-pg-simple. The column names are fixed by that library. */
export const sessions = pgTable(
  'sessions',
  {
    sid: varchar().primaryKey(),
    sess: json().notNull(),
    expire: timestamp({ precision: 6 }).notNull(),
  },
  (t) => [index('sessions_expire_idx').on(t.expire)],
);

/**
 * Admin-issued invites for staff and admin accounts. Only a SHA-256 hash of the
 * token is stored; the raw token exists only in the link handed to the invitee.
 */
export const invites = pgTable(
  'invites',
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    role: roleEnum().notNull(),
    tokenHash: text().notNull().unique(),
    invitedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    acceptedUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('invites_email_idx').on(t.email),
    check('invites_role_privileged', sql`${t.role} <> 'student'`),
  ],
);

export type InviteRow = typeof invites.$inferSelect;
