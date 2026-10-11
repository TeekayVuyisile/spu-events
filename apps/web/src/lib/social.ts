import type {
  Comment,
  CommentInput,
  CommentPage,
  EventDetail,
  LikeState,
  PhotoPage,
  ReactionKind,
  ReactionSummary,
} from '@spu-events/shared';
import {
  infiniteQueryOptions,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import { eventKeys } from '@/lib/events';

export const socialKeys = {
  comments: (eventId: string) => ['social', 'comments', eventId] as const,
  photos: (eventId: string) => ['social', 'photos', eventId] as const,
};

const withCursor = (path: string, cursor: string | null) =>
  cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path;

// ── Event likes (optimistic) ──

/** Flips the heart instantly; rolls back if the API refuses. */
export function useEventLike(event: Pick<EventDetail, 'id' | 'slug'>) {
  const queryClient = useQueryClient();
  const key = eventKeys.detail(event.slug);
  type Cached = { event: EventDetail };

  return useMutation({
    mutationFn: (liked: boolean) =>
      api<LikeState>(`/events/${event.id}/like`, { method: liked ? 'PUT' : 'DELETE' }),
    onMutate: async (liked) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Cached>(key);
      if (previous) {
        const delta = liked === previous.event.likedByMe ? 0 : liked ? 1 : -1;
        queryClient.setQueryData<Cached>(key, {
          event: {
            ...previous.event,
            likedByMe: liked,
            likeCount: previous.event.likeCount + delta,
          },
        });
      }
      return { previous };
    },
    onError: (_err, _liked, ctx) => ctx?.previous && queryClient.setQueryData(key, ctx.previous),
    onSuccess: (state) =>
      queryClient.setQueryData<Cached>(key, (old) =>
        old ? { event: { ...old.event, likedByMe: state.liked, likeCount: state.likeCount } } : old,
      ),
  });
}

// ── Comments ──

export const commentsQuery = (eventId: string) =>
  infiniteQueryOptions({
    queryKey: socialKeys.comments(eventId),
    queryFn: ({ pageParam }) =>
      api<CommentPage>(withCursor(`/events/${eventId}/comments`, pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

/** Applies `fn` to one comment wherever it sits in the cached pages (top level or reply). */
function updateComment(
  data: InfiniteData<CommentPage> | undefined,
  id: string,
  fn: (c: Comment) => Comment,
): InfiniteData<CommentPage> | undefined {
  if (!data) return data;
  const visit = (c: Comment): Comment =>
    c.id === id ? fn(c) : c.replies.length ? { ...c, replies: c.replies.map(visit) } : c;
  return { ...data, pages: data.pages.map((p) => ({ ...p, comments: p.comments.map(visit) })) };
}

export function useCommentMutations(eventId: string) {
  const queryClient = useQueryClient();
  const key = socialKeys.comments(eventId);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const add = useMutation({
    mutationFn: (input: CommentInput) =>
      api<{ comment: Comment }>(`/events/${eventId}/comments`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: refresh,
  });

  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      api<void>(`/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/comments/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  /** Optimistic: the reaction chip updates before the request finishes. */
  const react = useMutation({
    mutationFn: ({ id, kind, on }: { id: string; kind: ReactionKind; on: boolean }) =>
      api<{ reactions: ReactionSummary[] }>(`/comments/${id}/reactions/${kind}`, {
        method: on ? 'PUT' : 'DELETE',
      }),
    onMutate: async ({ id, kind, on }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<InfiniteData<CommentPage>>(key);
      queryClient.setQueryData<InfiniteData<CommentPage>>(key, (data) =>
        updateComment(data, id, (c) => {
          const existing = c.reactions.find((r) => r.kind === kind);
          const reactions = existing
            ? c.reactions
                .map((r) =>
                  r.kind === kind && r.mine !== on
                    ? { ...r, mine: on, count: r.count + (on ? 1 : -1) }
                    : r,
                )
                .filter((r) => r.count > 0)
            : on
              ? [...c.reactions, { kind, count: 1, mine: true }]
              : c.reactions;
          return { ...c, reactions };
        }),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && queryClient.setQueryData(key, ctx.previous),
    onSuccess: ({ reactions }, { id }) =>
      queryClient.setQueryData<InfiniteData<CommentPage>>(key, (data) =>
        updateComment(data, id, (c) => ({ ...c, reactions })),
      ),
  });

  return { add, edit, remove, react };
}

// ── Photo wall ──

export const photosQuery = (eventId: string) =>
  infiniteQueryOptions({
    queryKey: socialKeys.photos(eventId),
    queryFn: ({ pageParam }) => api<PhotoPage>(withCursor(`/events/${eventId}/photos`, pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

export function usePhotoMutations(eventId: string) {
  const queryClient = useQueryClient();
  const key = socialKeys.photos(eventId);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const upload = useMutation({
    mutationFn: ({ file, caption }: { file: File; caption: string }) => {
      const body = new FormData();
      body.append('caption', caption);
      body.append('photo', file);
      return api<{ id: string }>(`/events/${eventId}/photos`, { method: 'POST', body });
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/photos/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  /** Optimistic heart on a photo. */
  const like = useMutation({
    mutationFn: ({ id, liked }: { id: string; liked: boolean }) =>
      api<LikeState>(`/photos/${id}/like`, { method: liked ? 'PUT' : 'DELETE' }),
    onMutate: async ({ id, liked }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<InfiniteData<PhotoPage>>(key);
      queryClient.setQueryData<InfiniteData<PhotoPage>>(key, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((p) => ({
                ...p,
                photos: p.photos.map((ph) =>
                  ph.id === id && ph.likedByMe !== liked
                    ? { ...ph, likedByMe: liked, likeCount: ph.likeCount + (liked ? 1 : -1) }
                    : ph,
                ),
              })),
            }
          : data,
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && queryClient.setQueryData(key, ctx.previous),
  });

  return { upload, remove, like };
}
