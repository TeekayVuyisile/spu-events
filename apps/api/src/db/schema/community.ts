import {
  MODERATION_ACTIONS,
  NOTIFICATION_KINDS,
  REPORT_REASONS,
  REPORT_TARGETS,
  VOLUNTEER_STATUSES,
} from '@monthati/shared';
import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { events } from './events';
import { users } from './users';

export const volunteerStatusEnum = pgEnum('volunteer_status', VOLUNTEER_STATUSES);

export const volunteerApplications = pgTable(
  'volunteer_applications',
  {
    id: uuid().primaryKey().defaultRandom(),
    eventId: uuid()
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text().notNull(),
    motivation: text().notNull(),
    status: volunteerStatusEnum().notNull().default('pending'),
    decidedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One live application per student per event; withdrawn or declined ones can be retried.
    uniqueIndex('volunteer_one_active')
      .on(t.eventId, t.userId)
      .where(sql`${t.status} in ('pending', 'accepted')`),
    index('volunteer_event_status_idx').on(t.eventId, t.status),
  ],
);

export const reportTargetEnum = pgEnum('report_target', REPORT_TARGETS);
export const reportReasonEnum = pgEnum('report_reason', REPORT_REASONS);
export const reportStatusEnum = pgEnum('report_status', ['open', 'resolved', 'dismissed']);
export const moderationActionEnum = pgEnum('moderation_action', MODERATION_ACTIONS);

/** Polymorphic target (comment or photo) so one queue covers all reportable content. */
export const reports = pgTable(
  'reports',
  {
    id: uuid().primaryKey().defaultRandom(),
    reporterId: uuid().references(() => users.id, { onDelete: 'set null' }),
    targetType: reportTargetEnum().notNull(),
    targetId: uuid().notNull(),
    /** The reported content's author at report time (content may be deleted later). */
    targetUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    eventId: uuid()
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    reason: reportReasonEnum().notNull(),
    details: text().notNull().default(''),
    status: reportStatusEnum().notNull().default('open'),
    action: moderationActionEnum(),
    resolvedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reports_one_open_per_reporter')
      .on(t.reporterId, t.targetType, t.targetId)
      .where(sql`${t.status} = 'open'`),
    index('reports_status_created_idx').on(t.status, t.createdAt),
    index('reports_target_idx').on(t.targetType, t.targetId),
  ],
);

export const notificationKindEnum = pgEnum('notification_kind', NOTIFICATION_KINDS);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: notificationKindEnum().notNull(),
    title: text().notNull(),
    body: text().notNull().default(''),
    link: text(),
    readAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
    index('notifications_unread_idx')
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
  ],
);

export type NewNotification = typeof notifications.$inferInsert;
