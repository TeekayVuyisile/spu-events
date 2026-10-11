import { REACTIONS } from '@monthati/shared';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { events } from './events';
import { users } from './users';

export const eventLikes = pgTable(
  'event_likes',
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
    index('event_likes_user_idx').on(t.userId),
  ],
);

export const comments = pgTable(
  'comments',
  {
    id: uuid().primaryKey().defaultRandom(),
    eventId: uuid()
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** Always a top-level comment: threads are one level deep. */
    parentId: uuid().references((): AnyPgColumn => comments.id, { onDelete: 'cascade' }),
    body: text().notNull(),
    editedAt: timestamp({ withTimezone: true }),
    /** Soft delete keeps the thread readable; the body is blanked at the same time. */
    deletedAt: timestamp({ withTimezone: true }),
    deletedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('comments_event_created_idx').on(t.eventId, t.createdAt),
    index('comments_parent_idx').on(t.parentId),
    check('comments_body_length', sql`char_length(${t.body}) <= 1000`),
  ],
);

export const reactionKindEnum = pgEnum('reaction_kind', REACTIONS);

export const commentReactions = pgTable(
  'comment_reactions',
  {
    commentId: uuid()
      .notNull()
      .references(() => comments.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: reactionKindEnum().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId, t.kind] })],
);

export const photos = pgTable(
  'photos',
  {
    id: uuid().primaryKey().defaultRandom(),
    eventId: uuid()
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storageKey: text().notNull(),
    caption: text().notNull().default(''),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('photos_event_created_idx').on(t.eventId, t.createdAt),
    check('photos_caption_length', sql`char_length(${t.caption}) <= 200`),
  ],
);

export const photoLikes = pgTable(
  'photo_likes',
  {
    photoId: uuid()
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.photoId, t.userId] })],
);

export type CommentRow = typeof comments.$inferSelect;
export type PhotoRow = typeof photos.$inferSelect;
