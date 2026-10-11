import { z } from 'zod';

/** Rendered with Lucide icons in the web app, never emoji (MASTER.md §6). */
export const REACTIONS = ['like', 'love', 'haha', 'fire', 'hype'] as const;
export type ReactionKind = (typeof REACTIONS)[number];
export const reactionKindSchema = z.enum(REACTIONS);

export const COMMENT_MAX = 1000;
export const CAPTION_MAX = 200;

export const commentInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write something first')
    .max(COMMENT_MAX, `Keep it under ${COMMENT_MAX} characters`),
  /** Reply to this comment. Replies to replies join the same thread. */
  parentId: z.uuid().optional(),
});
export type CommentInput = z.infer<typeof commentInputSchema>;

export const commentEditSchema = commentInputSchema.pick({ body: true });

export const photoCaptionSchema = z.object({
  caption: z
    .string()
    .trim()
    .max(CAPTION_MAX, `Keep captions under ${CAPTION_MAX} characters`)
    .default(''),
});

/** Public identity on social content: first name and last initial only. */
export interface PublicAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ReactionSummary {
  kind: ReactionKind;
  count: number;
  mine: boolean;
}

export interface Comment {
  id: string;
  /** Null once deleted; the comment stays so its replies keep their context. */
  body: string | null;
  author: PublicAuthor | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  reactions: ReactionSummary[];
  /** Oldest first. Only top-level comments have replies. */
  replies: Comment[];
}

export interface CommentPage {
  comments: Comment[];
  total: number;
  nextCursor: string | null;
}

export interface Photo {
  id: string;
  url: string;
  caption: string;
  author: PublicAuthor;
  likeCount: number;
  likedByMe: boolean;
  createdAt: string;
}

export interface PhotoPage {
  photos: Photo[];
  nextCursor: string | null;
  /** The photo wall opens when the event starts. */
  opensAt: string;
  /** True for signed-in ticket holders once the wall is open. */
  canUpload: boolean;
}

export interface LikeState {
  liked: boolean;
  likeCount: number;
}

export const PHOTO_PAGE_SIZE = 24;
export const COMMENT_PAGE_SIZE = 20;
