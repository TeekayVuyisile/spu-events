import type { ReactionKind } from '@monthati/shared';
import { and, asc, desc, eq, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';
import type { Executor } from '../../db/client';
import {
  commentReactions,
  comments,
  eventLikes,
  photoLikes,
  photos,
  tickets,
  users,
} from '../../db/schema';

const author = {
  authorId: users.id,
  authorFirstName: users.firstName,
  authorLastName: users.lastName,
  authorAvatarUrl: users.avatarUrl,
};

export function socialRepository(db: Executor) {
  return {
    // ── Event likes ──

    async likeEvent(eventId: string, userId: string) {
      await db.insert(eventLikes).values({ eventId, userId }).onConflictDoNothing();
    },
    async unlikeEvent(eventId: string, userId: string) {
      await db
        .delete(eventLikes)
        .where(and(eq(eventLikes.eventId, eventId), eq(eventLikes.userId, userId)));
    },
    async eventLikeState(eventId: string, userId: string | undefined) {
      const [row] = await db
        .select({
          likeCount: sql<number>`count(*)::int`,
          liked: userId
            ? sql<boolean>`bool_or(${eventLikes.userId} = ${userId})`
            : sql<boolean>`false`,
        })
        .from(eventLikes)
        .where(eq(eventLikes.eventId, eventId));
      return { likeCount: row!.likeCount, liked: Boolean(row!.liked) };
    },

    async holdsTicket(eventId: string, userId: string) {
      const [row] = await db
        .select({ id: tickets.id })
        .from(tickets)
        .where(
          and(
            eq(tickets.eventId, eventId),
            eq(tickets.userId, userId),
            ne(tickets.status, 'cancelled'),
          ),
        );
      return Boolean(row);
    },

    // ── Comments ──

    /** One page of top-level comments, newest first. */
    async topLevelComments(
      eventId: string,
      cursor: { ts: string; id: string } | null,
      limit: number,
    ) {
      const where: SQL[] = [eq(comments.eventId, eventId), isNull(comments.parentId)];
      if (cursor)
        where.push(
          sql`(${comments.createdAt}, ${comments.id}) < (${cursor.ts}::timestamptz, ${cursor.id}::uuid)`,
        );
      return db
        .select({
          comment: comments,
          cursorTs: sql<string>`${comments.createdAt}::text`,
          ...author,
        })
        .from(comments)
        .leftJoin(users, eq(users.id, comments.userId))
        .where(and(...where))
        .orderBy(desc(comments.createdAt), desc(comments.id))
        .limit(limit + 1);
    },

    async replies(parentIds: string[]) {
      if (!parentIds.length) return [];
      return db
        .select({ comment: comments, ...author })
        .from(comments)
        .leftJoin(users, eq(users.id, comments.userId))
        .where(inArray(comments.parentId, parentIds))
        .orderBy(asc(comments.createdAt), asc(comments.id));
    },

    async countVisibleComments(eventId: string) {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(comments)
        .where(and(eq(comments.eventId, eventId), isNull(comments.deletedAt)));
      return row!.n;
    },

    /** Reaction counts per comment, plus which ones the viewer added. */
    async reactions(commentIds: string[], viewerId: string | undefined) {
      if (!commentIds.length) return [];
      return db
        .select({
          commentId: commentReactions.commentId,
          kind: commentReactions.kind,
          count: sql<number>`count(*)::int`,
          mine: viewerId
            ? sql<boolean>`bool_or(${commentReactions.userId} = ${viewerId})`
            : sql<boolean>`false`,
        })
        .from(commentReactions)
        .where(inArray(commentReactions.commentId, commentIds))
        .groupBy(commentReactions.commentId, commentReactions.kind);
    },

    async findComment(id: string) {
      const [row] = await db.select().from(comments).where(eq(comments.id, id));
      return row;
    },

    async insertComment(values: typeof comments.$inferInsert) {
      const [row] = await db.insert(comments).values(values).returning();
      return row!;
    },

    async editComment(id: string, body: string) {
      await db
        .update(comments)
        .set({ body, editedAt: sql`now()` })
        .where(and(eq(comments.id, id), isNull(comments.deletedAt)));
    },

    /** Blanks the body too, so deleted words don't linger in the database. */
    async deleteComment(id: string, deletedById: string) {
      await db
        .update(comments)
        .set({ body: '', deletedAt: sql`now()`, deletedById })
        .where(and(eq(comments.id, id), isNull(comments.deletedAt)));
    },

    async react(commentId: string, userId: string, kind: ReactionKind) {
      await db.insert(commentReactions).values({ commentId, userId, kind }).onConflictDoNothing();
    },
    async unreact(commentId: string, userId: string, kind: ReactionKind) {
      await db
        .delete(commentReactions)
        .where(
          and(
            eq(commentReactions.commentId, commentId),
            eq(commentReactions.userId, userId),
            eq(commentReactions.kind, kind),
          ),
        );
    },

    // ── Photos ──

    async listPhotos(
      eventId: string,
      cursor: { ts: string; id: string } | null,
      limit: number,
      viewerId: string | undefined,
    ) {
      const where: SQL[] = [eq(photos.eventId, eventId)];
      if (cursor)
        where.push(
          sql`(${photos.createdAt}, ${photos.id}) < (${cursor.ts}::timestamptz, ${cursor.id}::uuid)`,
        );
      return db
        .select({
          photo: photos,
          cursorTs: sql<string>`${photos.createdAt}::text`,
          ...author,
          likeCount: sql<number>`(select count(*)::int from photo_likes pl where pl.photo_id = "photos"."id")`,
          likedByMe: viewerId
            ? sql<boolean>`exists(select 1 from photo_likes pl where pl.photo_id = "photos"."id" and pl.user_id = ${viewerId})`
            : sql<boolean>`false`,
        })
        .from(photos)
        .innerJoin(users, eq(users.id, photos.userId))
        .where(and(...where))
        .orderBy(desc(photos.createdAt), desc(photos.id))
        .limit(limit + 1);
    },

    async findPhoto(id: string) {
      const [row] = await db.select().from(photos).where(eq(photos.id, id));
      return row;
    },

    async insertPhoto(values: typeof photos.$inferInsert) {
      const [row] = await db.insert(photos).values(values).returning();
      return row!;
    },

    async deletePhoto(id: string) {
      const [row] = await db.delete(photos).where(eq(photos.id, id)).returning();
      return row;
    },

    async likePhoto(photoId: string, userId: string) {
      await db.insert(photoLikes).values({ photoId, userId }).onConflictDoNothing();
    },
    async unlikePhoto(photoId: string, userId: string) {
      await db
        .delete(photoLikes)
        .where(and(eq(photoLikes.photoId, photoId), eq(photoLikes.userId, userId)));
    },
    async photoLikeState(photoId: string, userId: string) {
      const [row] = await db
        .select({
          likeCount: sql<number>`count(*)::int`,
          liked: sql<boolean>`coalesce(bool_or(${photoLikes.userId} = ${userId}), false)`,
        })
        .from(photoLikes)
        .where(eq(photoLikes.photoId, photoId));
      return { likeCount: row!.likeCount, liked: row!.liked };
    },
  };
}

export type SocialRepository = ReturnType<typeof socialRepository>;
