import { dateBlock, formatTime, type EventSummary } from '@monthati/shared';
import { Heart, MapPin } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { formatPrice, isLive } from '@/lib/events';
import { duration } from '@/lib/motion';
import { EventCover } from './event-cover';

/**
 * Discover grid card: a ticket stub with the cover on top and the date block below.
 * The notch sits on the perforation: the cover is 16:9, so it is 9/16 of the card width down.
 */
export function EventCard({ event }: { event: EventSummary }) {
  const { month, day } = dateBlock(event.startsAt);
  const live = isLive(event);
  const spotsLeft = Math.max(0, event.capacity - event.ticketsSold);

  return (
    <motion.article
      whileHover={{ scale: 1.02 }}
      transition={{ duration: duration.fast }}
      className="group @container relative h-full"
    >
      <Link
        to={`/events/${event.slug}`}
        className="ticket-notch flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgb(26_16_51/.06),0_8px_24px_rgb(26_16_51/.06)] transition-shadow group-hover:shadow-[0_2px_4px_rgb(26_16_51/.08),0_16px_32px_rgb(26_16_51/.1)] [--notch-y:calc(100cqw*9/16)] dark:shadow-none"
      >
        <EventCover event={event} className="aspect-video" />
        <div className="perforation" />
        <div className="flex flex-1 gap-4 p-4">
          <div className="flex w-12 shrink-0 flex-col items-center self-start rounded-lg bg-primary/10 py-1.5 text-primary">
            <span className="text-xs font-semibold uppercase">{month}</span>
            <span className="tabular text-xl leading-none font-bold">{day}</span>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h3 className="line-clamp-2 text-lg leading-snug font-semibold">{event.title}</h3>
            <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{event.venue}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="tabular text-sm font-semibold">{formatPrice(event.priceCents)}</span>
              <span className="tabular text-sm text-muted-foreground">
                · {formatTime(event.startsAt)}
              </span>
              {event.likeCount > 0 && (
                <span
                  className="tabular inline-flex items-center gap-1 text-sm text-muted-foreground"
                  aria-label={`${event.likeCount} likes`}
                >
                  · <Heart className="size-3.5" aria-hidden /> {event.likeCount}
                </span>
              )}
              {live && (
                <Badge tone="destructive">
                  <span
                    className="size-1.5 animate-pulse rounded-full bg-destructive"
                    aria-hidden
                  />
                  Live now
                </Badge>
              )}
              {spotsLeft === 0 ? (
                <Badge>Sold out</Badge>
              ) : (
                spotsLeft <= 10 && <Badge tone="warning">{spotsLeft} left</Badge>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}
