import { ROLES } from '@monthati/shared';
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ROLES);
export const userStatusEnum = pgEnum('user_status', ['active', 'suspended']);

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  role: roleEnum().notNull().default('student'),
  status: userStatusEnum().notNull().default('active'),
  /** 9-digit SPU student number; null for staff/admin accounts. */
  studentNumber: text().unique(),
  email: text().notNull().unique(),
  firstName: text().notNull(),
  lastName: text().notNull(),
  passwordHash: text().notNull(),
  avatarUrl: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
