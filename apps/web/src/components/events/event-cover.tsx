import type { EventSummary } from '@monthati/shared';
import { motion } from 'motion/react';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { categoryIcons } from './category-icons';

/**
 * Event cover image, or a branded fallback when there isn't one. `layoutId`
 * makes the card's cover grow into the event page's hero (MASTER.md §5, moment 1).
 */
export function EventCover({
  event,
  className,
  shared = true,
  eager = false,
}: {
  event: Pick<EventSummary, 'id' | 'coverUrl' | 'category'>;
  className?: string;
  /** Turn off where the same event could appear twice on screen (admin lists). */
  shared?: boolean;
  eager?: boolean;
}) {
  const Icon = categoryIcons[event.category];
  return (
    <motion.div
      layoutId={shared ? `event-cover-${event.id}` : undefined}
      transition={spring.snappy}
      className={cn('relative overflow-hidden bg-muted', className)}
    >
      {event.coverUrl ? (
        <img
          src={event.coverUrl}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/25 via-primary/10 to-cta/20">
          <Icon className="size-12 text-primary/60" strokeWidth={1.5} aria-hidden />
        </div>
      )}
    </motion.div>
  );
}
