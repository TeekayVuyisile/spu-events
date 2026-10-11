import type { EventDetail } from '@spu-events/shared';
import { Heart } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useSession } from '@/lib/auth';
import { spring } from '@/lib/motion';
import { useEventLike } from '@/lib/social';
import { cn } from '@/lib/utils';

/** Heart + count. Optimistic; signed-out visitors are sent to log in first. */
export function EventLikeButton({ event }: { event: EventDetail }) {
  const { user } = useSession();
  const navigate = useNavigate();
  const like = useEventLike(event);
  const liked = event.likedByMe;
  const disabled = event.status !== 'published';

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={liked}
      aria-label={liked ? 'Unlike this event' : 'Like this event'}
      onClick={() => {
        if (!user) return navigate(`/login?next=${encodeURIComponent(`/events/${event.slug}`)}`);
        like.mutate(!liked, { onError: (err) => toast.error(err.message) });
      }}
      className={cn(
        'inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        liked
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'hover:border-destructive/40 hover:text-destructive',
      )}
    >
      <motion.span
        key={String(liked)}
        initial={liked ? { scale: 0.6 } : false}
        animate={{ scale: 1 }}
        transition={spring.pop}
      >
        <Heart className={cn('size-5', liked && 'fill-current')} aria-hidden />
      </motion.span>
      <span className="tabular">{event.likeCount}</span>
    </button>
  );
}
