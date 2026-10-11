import { CATEGORY_LABELS, formatEventWhen, formatLongDate } from '@monthati/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, CalendarX, HandHelping, MapPin } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { categoryIcons } from '@/components/events/category-icons';
import { EventCover } from '@/components/events/event-cover';
import { VolunteerCard } from '@/components/community/volunteer-card';
import { TicketBox } from '@/components/events/ticket-box';
import { CommentsSection } from '@/components/social/comments';
import { EventLikeButton } from '@/components/social/like-button';
import { PhotoWall } from '@/components/social/photo-wall';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api';
import { eventQuery, hasEnded, isLive } from '@/lib/events';
import { NotFoundPage } from '@/routes/not-found';

export function EventPage() {
  const { slug = '' } = useParams();
  const query = useQuery(eventQuery(slug));

  if (query.isPending) {
    return (
      <div className="space-y-6" aria-busy>
        <Skeleton className="aspect-[21/9] w-full rounded-xl" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
      </div>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiRequestError && query.error.status === 404)
      return <NotFoundPage />;
    throw query.error;
  }

  const event = query.data;
  const cancelled = event.status === 'cancelled';
  const ended = hasEnded(event);
  const CategoryIcon = categoryIcons[event.category];

  return (
    <article className="space-y-8">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link to="/">
          <ArrowLeft aria-hidden /> All events
        </Link>
      </Button>

      <EventCover event={event} eager className="aspect-video rounded-xl md:aspect-[21/9]" />

      {cancelled && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/8 p-4 text-destructive"
        >
          <CalendarX className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p className="font-semibold">This event has been cancelled</p>
            {event.cancellationReason && <p className="text-sm">{event.cancellationReason}</p>}
          </div>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone="primary">
                <CategoryIcon aria-hidden /> {CATEGORY_LABELS[event.category]}
              </Badge>
              {isLive(event) && !cancelled && (
                <Badge tone="destructive">
                  <span
                    className="size-1.5 animate-pulse rounded-full bg-destructive"
                    aria-hidden
                  />
                  Live now
                </Badge>
              )}
              {ended && !cancelled && <Badge>Ended</Badge>}
              {event.volunteersWanted && !cancelled && !ended && (
                <Badge tone="success">
                  <HandHelping aria-hidden /> Volunteers wanted
                </Badge>
              )}
            </div>
            <h1 className="text-4xl leading-tight font-extrabold text-balance md:text-5xl">
              {event.title}
            </h1>
            <EventLikeButton event={event} />
          </div>

          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="flex gap-3">
              <CalendarDays className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <div>
                <dt className="sr-only">When</dt>
                <dd className="font-semibold">{formatLongDate(event.startsAt)}</dd>
                <dd className="tabular text-sm text-muted-foreground">
                  {formatEventWhen(event.startsAt, event.endsAt)}
                </dd>
              </div>
            </div>
            <div className="flex gap-3">
              <MapPin className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <div>
                <dt className="sr-only">Where</dt>
                <dd className="font-semibold">{event.venue}</dd>
                <dd className="text-sm text-muted-foreground">Sol Plaatje University</dd>
              </div>
            </div>
          </dl>

          {event.description && (
            <section className="space-y-2">
              <h2 className="text-xl font-bold">About</h2>
              <p className="max-w-[70ch] leading-relaxed whitespace-pre-line text-muted-foreground">
                {event.description}
              </p>
            </section>
          )}

          <VolunteerCard event={event} />
          <PhotoWall event={event} />
          <CommentsSection event={event} />
        </div>

        <TicketBox event={event} />
      </div>
    </article>
  );
}
