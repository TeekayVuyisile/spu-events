import {
  COMMENT_MAX,
  REACTIONS,
  type Comment,
  type EventDetail,
  type ReactionKind,
} from '@monthati/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  Flag,
  Flame,
  Heart,
  Laugh,
  MessageCircle,
  PartyPopper,
  Pencil,
  Reply,
  SmilePlus,
  ThumbsUp,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ReportDialog } from '@/components/community/report-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/auth';
import { duration, ease } from '@/lib/motion';
import { commentsQuery, useCommentMutations } from '@/lib/social';
import { cn } from '@/lib/utils';

const reactionIcons: Record<ReactionKind, { icon: LucideIcon; label: string }> = {
  like: { icon: ThumbsUp, label: 'Like' },
  love: { icon: Heart, label: 'Love' },
  haha: { icon: Laugh, label: 'Haha' },
  fire: { icon: Flame, label: 'Fire' },
  hype: { icon: PartyPopper, label: 'Hype' },
};

const ago = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function timeAgo(iso: string) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.35, 'week'],
    [12, 'month'],
  ];
  let value = s;
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return ago.format(Math.round(value), unit);
    value /= size;
  }
  return ago.format(Math.round(value), 'year');
}

export function CommentsSection({ event }: { event: EventDetail }) {
  const { user } = useSession();
  const query = useInfiniteQuery(commentsQuery(event.id));
  const comments = query.data?.pages.flatMap((p) => p.comments) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const open = event.status === 'published';

  return (
    <section className="space-y-4" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="flex items-center gap-2 text-xl font-bold">
        <MessageCircle className="size-5 text-primary" aria-hidden /> Comments
        {total > 0 && <span className="tabular text-base text-muted-foreground">{total}</span>}
      </h2>

      {open &&
        (user ? (
          <Composer eventId={event.id} />
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <Link
              to={`/login?next=${encodeURIComponent(`/events/${event.slug}`)}`}
              className="font-semibold text-primary hover:underline"
            >
              Log in
            </Link>{' '}
            to join the conversation.
          </p>
        ))}

      {query.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : query.isError ? (
        <FormAlert message={query.error.message} />
      ) : comments.length === 0 ? (
        <p className="text-muted-foreground">No comments yet. Start the conversation.</p>
      ) : (
        <ul className="space-y-5">
          <AnimatePresence initial={false}>
            {comments.map((c) => (
              <motion.li
                key={c.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: duration.base, ease: ease.out }}
              >
                <CommentItem eventId={event.id} comment={c} canReply={open} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {query.hasNextPage && (
        <Button
          variant="outline"
          loading={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          Older comments
        </Button>
      )}
    </section>
  );
}

function Composer({
  eventId,
  parentId,
  initial = '',
  submitLabel = 'Post',
  onDone,
  autoFocus,
}: {
  eventId: string;
  parentId?: string;
  initial?: string;
  submitLabel?: string;
  onDone?: (body: string) => void;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState(initial);
  const { add } = useCommentMutations(eventId);
  const editing = Boolean(onDone && initial);
  const trimmed = body.trim();

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!trimmed) return;
        if (editing) return onDone!(trimmed);
        add.mutate(
          { body: trimmed, parentId },
          {
            onSuccess: () => {
              setBody('');
              onDone?.(trimmed);
            },
            onError: (err) => toast.error(err.message),
          },
        );
      }}
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={COMMENT_MAX}
        rows={parentId ? 2 : 3}
        autoFocus={autoFocus}
        aria-label={parentId ? 'Write a reply' : 'Write a comment'}
        placeholder={parentId ? 'Write a reply…' : 'Ask a question or share your plans…'}
        className="min-h-0"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="tabular text-xs text-muted-foreground">
          {body.length > COMMENT_MAX - 100 && `${COMMENT_MAX - body.length} left`}
        </span>
        <div className="flex gap-2">
          {onDone && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11"
              onClick={() => onDone('')}
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            size="sm"
            className="h-11"
            disabled={!trimmed}
            loading={add.isPending}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

function CommentItem({
  eventId,
  comment,
  canReply,
  isReply = false,
}: {
  eventId: string;
  comment: Comment;
  canReply: boolean;
  isReply?: boolean;
}) {
  const { user } = useSession();
  const { edit, remove, react } = useCommentMutations(eventId);
  const [mode, setMode] = useState<'view' | 'edit' | 'reply'>('view');
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reporting, setReporting] = useState(false);
  const mine = Boolean(user && comment.author?.id === user.id);
  const canDelete = mine || user?.role === 'admin';

  const toggle = (kind: ReactionKind, on: boolean) => {
    setPicking(false);
    react.mutate({ id: comment.id, kind, on }, { onError: (err) => toast.error(err.message) });
  };

  return (
    <div className="flex gap-3">
      {comment.author ? (
        <Avatar
          user={{
            firstName: comment.author.name,
            // "Lerato M.": the initial is the second word.
            lastName: comment.author.name.split(' ')[1] ?? '',
            avatarUrl: comment.author.avatarUrl,
          }}
          className={isReply ? 'size-8' : undefined}
        />
      ) : (
        <span
          className={cn('shrink-0 rounded-full bg-muted', isReply ? 'size-8' : 'size-9')}
          aria-hidden
        />
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm">
          <span className="font-semibold">{comment.author?.name ?? 'Deleted'}</span>{' '}
          <span className="text-muted-foreground">
            · {timeAgo(comment.createdAt)}
            {comment.editedAt && ' · edited'}
          </span>
        </p>

        {mode === 'edit' ? (
          <Composer
            eventId={eventId}
            initial={comment.body ?? ''}
            submitLabel="Save"
            autoFocus
            onDone={(body) => {
              if (!body) return setMode('view');
              edit.mutate(
                { id: comment.id, body },
                { onSuccess: () => setMode('view'), onError: (err) => toast.error(err.message) },
              );
            }}
          />
        ) : comment.deleted ? (
          <p className="text-sm text-muted-foreground italic">This comment was deleted.</p>
        ) : (
          <p className="leading-relaxed break-words whitespace-pre-line">{comment.body}</p>
        )}

        {!comment.deleted && mode !== 'edit' && (
          <div className="flex flex-wrap items-center gap-1.5">
            {comment.reactions.map((r) => {
              const { icon: Icon, label } = reactionIcons[r.kind];
              return (
                <button
                  key={r.kind}
                  type="button"
                  disabled={!user}
                  aria-pressed={r.mine}
                  aria-label={`${label}: ${r.count}`}
                  onClick={() => toggle(r.kind, !r.mine)}
                  className={cn(
                    'tabular hit-44 inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors disabled:cursor-default',
                    r.mine
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'hover:border-primary/30',
                  )}
                >
                  <Icon className="size-3.5" aria-hidden /> {r.count}
                </button>
              );
            })}

            {user && (
              <div className="relative">
                <button
                  type="button"
                  aria-label="Add a reaction"
                  aria-expanded={picking}
                  onClick={() => setPicking((p) => !p)}
                  className="hit-44 inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <SmilePlus className="size-4" aria-hidden />
                </button>
                {picking && (
                  <div
                    role="group"
                    aria-label="Reactions"
                    className="absolute bottom-full left-0 z-30 mb-1 flex gap-1 rounded-full border bg-popover p-1 shadow-lg"
                  >
                    {REACTIONS.map((kind) => {
                      const { icon: Icon, label } = reactionIcons[kind];
                      const on = comment.reactions.some((r) => r.kind === kind && r.mine);
                      return (
                        <button
                          key={kind}
                          type="button"
                          aria-label={label}
                          aria-pressed={on}
                          title={label}
                          onClick={() => toggle(kind, !on)}
                          className={cn(
                            'flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-muted',
                            on && 'text-primary',
                          )}
                        >
                          <Icon className="size-5" aria-hidden />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {user && canReply && !isReply && (
              <ActionButton
                icon={Reply}
                label="Reply"
                onClick={() => setMode(mode === 'reply' ? 'view' : 'reply')}
              />
            )}
            {mine && <ActionButton icon={Pencil} label="Edit" onClick={() => setMode('edit')} />}
            {canDelete && (
              <ActionButton
                icon={Trash2}
                label={confirmDelete ? 'Tap again to delete' : 'Delete'}
                destructive
                onClick={() => {
                  // Two taps, so a stray touch can't delete a comment.
                  if (!confirmDelete) return setConfirmDelete(true);
                  remove.mutate(comment.id, {
                    onSuccess: () => toast.success('Comment deleted'),
                    onError: (err) => toast.error(err.message),
                    onSettled: () => setConfirmDelete(false),
                  });
                }}
              />
            )}
            {user && !mine && (
              <ActionButton icon={Flag} label="Report" onClick={() => setReporting(true)} />
            )}
          </div>
        )}

        {reporting && (
          <ReportDialog
            targetType="comment"
            targetId={comment.id}
            onClose={() => setReporting(false)}
          />
        )}

        {mode === 'reply' && (
          <Composer
            eventId={eventId}
            parentId={comment.id}
            submitLabel="Reply"
            autoFocus
            onDone={() => setMode('view')}
          />
        )}

        {comment.replies.length > 0 && (
          <ul className="space-y-4 border-l-2 pt-2 pl-4">
            {comment.replies.map((r) => (
              <li key={r.id}>
                <CommentItem eventId={eventId} comment={r} canReply={canReply} isReply />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'hit-44 inline-flex h-8 cursor-pointer items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted',
        destructive ? 'hover:text-destructive' : 'hover:text-foreground',
      )}
    >
      <Icon className="size-3.5" aria-hidden /> {label}
    </button>
  );
}
