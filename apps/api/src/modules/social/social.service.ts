import {
  COMMENT_PAGE_SIZE,
  PHOTO_PAGE_SIZE,
  REACTIONS,
  type Comment,
  type CommentInput,
  type CommentPage,
  type LikeState,
  type Photo,
  type PhotoPage,
  type PublicAuthor,
  type ReactionKind,
  type ReactionSummary,
  type Role,
} from '@spu-events/shared';
import { randomBytes } from 'node:crypto';
import type { Db } from '../../db/client';
import type { CommentRow } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { detectImage } from '../../lib/image';
import type { StorageService } from '../../lib/storage';
import { eventsRepository } from '../events/events.repository';
import { usersRepository } from '../users/users.repository';
import { decodeCursor, encodeCursor } from '../../lib/cursor';
import { socialRepository } from './social.repository';

export interface Actor {
  id: string;
  role: Role;
}

type AuthorCols = {
  authorId: string | null;
  authorFirstName: string | null;
  authorLastName: string | null;
  authorAvatarUrl: string | null;
};

/** First name and last initial: enough to recognise friends, not enough to look anyone up. */
function publicAuthor(a: AuthorCols): PublicAuthor | null {
  if (!a.authorId || !a.authorFirstName) return null;
  return {
    id: a.authorId,
    name: `${a.authorFirstName} ${a.authorLastName?.[0] ?? ''}.`.replace(/ \.$/, ''),
    avatarUrl: a.authorAvatarUrl,
  };
}

const eventNotFound = () => AppError.notFound('Event not found');

export function socialService({ db, storage }: { db: Db; storage: StorageService }) {
  const repo = socialRepository(db);
  const events = eventsRepository(db);

  /** Social features exist on published and cancelled events; drafts are invisible. */
  async function visibleEvent(eventId: string) {
    const event = await events.findById(eventId);
    if (!event || event.status === 'draft') throw eventNotFound();
    return event;
  }

  /** Writing (liking, commenting, posting) is for events that are actually on. */
  async function openEvent(eventId: string) {
    const event = await visibleEvent(eventId);
    if (event.status === 'cancelled') throw AppError.conflict('This event was cancelled');
    return event;
  }

  async function reactionsFor(ids: string[], viewerId: string | undefined) {
    const rows = await repo.reactions(ids, viewerId);
    const byComment = new Map<string, ReactionSummary[]>();
    for (const r of rows) {
      const list = byComment.get(r.commentId) ?? [];
      list.push({ kind: r.kind, count: r.count, mine: Boolean(r.mine) });
      byComment.set(r.commentId, list);
    }
    // A stable order (the REACTIONS order) so the bar doesn't shuffle as counts change.
    for (const list of byComment.values()) {
      list.sort((a, b) => REACTIONS.indexOf(a.kind) - REACTIONS.indexOf(b.kind));
    }
    return byComment;
  }

  function toComment(
    row: { comment: CommentRow } & AuthorCols,
    reactions: Map<string, ReactionSummary[]>,
    replies: Comment[] = [],
  ): Comment {
    const deleted = row.comment.deletedAt !== null;
    return {
      id: row.comment.id,
      body: deleted ? null : row.comment.body,
      author: deleted ? null : publicAuthor(row),
      createdAt: row.comment.createdAt.toISOString(),
      editedAt: row.comment.editedAt?.toISOString() ?? null,
      deleted,
      reactions: deleted ? [] : (reactions.get(row.comment.id) ?? []),
      replies,
    };
  }

  async function getComment(id: string) {
    const c = await repo.findComment(id);
    if (!c) throw AppError.notFound('Comment not found');
    return c;
  }

  /** Authors manage their own content; admins moderate anyone's. */
  function assertOwnerOrAdmin(actor: Actor, ownerId: string | null) {
    if (actor.role !== 'admin' && actor.id !== ownerId) {
      throw AppError.forbidden('You can only change your own posts');
    }
  }

  return {
    // ── Event likes ──

    async likeEvent(actor: Actor, eventId: string, liked: boolean): Promise<LikeState> {
      if (liked) {
        await openEvent(eventId);
        await repo.likeEvent(eventId, actor.id);
      } else {
        await visibleEvent(eventId);
        await repo.unlikeEvent(eventId, actor.id);
      }
      return repo.eventLikeState(eventId, actor.id);
    },

    likedByMe: async (eventId: string, viewerId: string | undefined) =>
      viewerId ? (await repo.eventLikeState(eventId, viewerId)).liked : false,

    // ── Comments ──

    /**
     * Newest threads first, each with all its replies (oldest first). A deleted
     * comment only shows (as "deleted") while it still has visible replies.
     */
    async listComments(
      eventId: string,
      cursor: string | undefined,
      viewerId?: string,
    ): Promise<CommentPage> {
      await visibleEvent(eventId);
      const rows = await repo.topLevelComments(eventId, decodeCursor(cursor), COMMENT_PAGE_SIZE);
      const page = rows.slice(0, COMMENT_PAGE_SIZE);
      const replyRows = await repo.replies(page.map((r) => r.comment.id));
      const reactions = await reactionsFor(
        [...page, ...replyRows].map((r) => r.comment.id),
        viewerId,
      );

      const repliesByParent = new Map<string, Comment[]>();
      for (const r of replyRows) {
        if (r.comment.deletedAt) continue;
        const list = repliesByParent.get(r.comment.parentId!) ?? [];
        list.push(toComment(r, reactions));
        repliesByParent.set(r.comment.parentId!, list);
      }

      const last = page.at(-1);
      return {
        comments: page
          .map((r) => toComment(r, reactions, repliesByParent.get(r.comment.id) ?? []))
          .filter((c) => !c.deleted || c.replies.length > 0),
        total: await repo.countVisibleComments(eventId),
        nextCursor:
          rows.length > COMMENT_PAGE_SIZE && last
            ? encodeCursor(last.cursorTs, last.comment.id)
            : null,
      };
    },

    async addComment(actor: Actor, eventId: string, input: CommentInput): Promise<Comment> {
      await openEvent(eventId);
      let parentId: string | null = null;
      if (input.parentId) {
        const parent = await getComment(input.parentId);
        if (parent.eventId !== eventId)
          throw AppError.badRequest('That comment is on another event');
        if (parent.deletedAt) throw AppError.conflict('That comment was deleted');
        // Threads are one level deep: replying to a reply joins its thread.
        parentId = parent.parentId ?? parent.id;
      }
      const row = await repo.insertComment({
        eventId,
        userId: actor.id,
        parentId,
        body: input.body,
      });
      const me = await usersRepository(db).findById(actor.id);
      return toComment(
        {
          comment: row,
          authorId: me!.id,
          authorFirstName: me!.firstName,
          authorLastName: me!.lastName,
          authorAvatarUrl: me!.avatarUrl,
        },
        new Map(),
      );
    },

    async editComment(actor: Actor, id: string, body: string) {
      const c = await getComment(id);
      if (c.userId !== actor.id) throw AppError.forbidden('You can only edit your own comments');
      if (c.deletedAt) throw AppError.conflict('That comment was deleted');
      await repo.editComment(id, body);
    },

    async deleteComment(actor: Actor, id: string) {
      const c = await getComment(id);
      assertOwnerOrAdmin(actor, c.userId);
      await repo.deleteComment(id, actor.id);
    },

    async react(actor: Actor, commentId: string, kind: ReactionKind, on: boolean) {
      const c = await getComment(commentId);
      if (c.deletedAt) throw AppError.conflict('That comment was deleted');
      await visibleEvent(c.eventId);
      if (on) await repo.react(commentId, actor.id, kind);
      else await repo.unreact(commentId, actor.id, kind);
      return (await reactionsFor([commentId], actor.id)).get(commentId) ?? [];
    },

    // ── Photo wall ──

    async listPhotos(
      eventId: string,
      cursor: string | undefined,
      viewer?: Actor,
    ): Promise<PhotoPage> {
      const event = await visibleEvent(eventId);
      const rows = await repo.listPhotos(
        eventId,
        decodeCursor(cursor),
        PHOTO_PAGE_SIZE,
        viewer?.id,
      );
      const page = rows.slice(0, PHOTO_PAGE_SIZE);
      const last = page.at(-1);
      const open = event.status === 'published' && event.startsAt <= new Date();
      const canUpload =
        open &&
        Boolean(viewer) &&
        (viewer!.role === 'admin' || (await repo.holdsTicket(eventId, viewer!.id)));

      return {
        photos: page.map((r): Photo => ({
          id: r.photo.id,
          url: storage.url(r.photo.storageKey),
          caption: r.photo.caption,
          author: publicAuthor(r)!,
          likeCount: r.likeCount,
          likedByMe: Boolean(r.likedByMe),
          createdAt: r.photo.createdAt.toISOString(),
        })),
        nextCursor:
          rows.length > PHOTO_PAGE_SIZE && last ? encodeCursor(last.cursorTs, last.photo.id) : null,
        opensAt: event.startsAt.toISOString(),
        canUpload,
      };
    },

    /** Ticket holders (and admins) post once the event has started. */
    async addPhoto(actor: Actor, eventId: string, file: Buffer, caption: string) {
      const event = await openEvent(eventId);
      if (event.startsAt > new Date()) {
        throw AppError.conflict('The photo wall opens when the event starts');
      }
      if (actor.role !== 'admin' && !(await repo.holdsTicket(eventId, actor.id))) {
        throw AppError.forbidden('Only ticket holders can post photos');
      }
      const image = detectImage(file);
      if (!image) {
        throw AppError.badRequest('Upload a JPG, PNG or WebP image', {
          photo: ['Upload a JPG, PNG or WebP image'],
        });
      }
      const key = `photos/${eventId}-${randomBytes(8).toString('hex')}.${image.ext}`;
      await storage.put(key, file, image.contentType);
      try {
        return await repo.insertPhoto({ eventId, userId: actor.id, storageKey: key, caption });
      } catch (err) {
        await storage.delete(key);
        throw err;
      }
    },

    async deletePhoto(actor: Actor, id: string) {
      const photo = await repo.findPhoto(id);
      if (!photo) throw AppError.notFound('Photo not found');
      assertOwnerOrAdmin(actor, photo.userId);
      await repo.deletePhoto(id);
      await storage.delete(photo.storageKey);
    },

    async likePhoto(actor: Actor, id: string, liked: boolean): Promise<LikeState> {
      const photo = await repo.findPhoto(id);
      if (!photo) throw AppError.notFound('Photo not found');
      if (liked) await repo.likePhoto(id, actor.id);
      else await repo.unlikePhoto(id, actor.id);
      return repo.photoLikeState(id, actor.id);
    },
  };
}

export type SocialService = ReturnType<typeof socialService>;
