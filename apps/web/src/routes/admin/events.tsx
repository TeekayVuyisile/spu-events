import { adminEventListQuerySchema, formatEventWhen, type EventStatus } from '@spu-events/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, Loader2, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EventCover } from '@/components/events/event-cover';
import { EventStatusBadge } from '@/components/events/event-status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { adminEventsQuery, formatPrice } from '@/lib/events';

const tabs: { value: EventStatus | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'published', label: 'Published' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function AdminEventsPage() {
  const [params, setParams] = useSearchParams();
  const filters = adminEventListQuerySchema.parse(Object.fromEntries(params));
  const [search, setSearch] = useState(filters.q ?? '');

  const update = (key: 'q' | 'status', value: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  useEffect(() => {
    const id = setTimeout(() => {
      if ((filters.q ?? '') !== search.trim()) update('q', search.trim() || undefined);
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the input
  }, [search]);

  const events = useQuery(adminEventsQuery(filters));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold md:text-4xl">Events</h1>
          <p className="text-muted-foreground">
            Drafts are only visible to admins until you publish them.
          </p>
        </div>
        <Button asChild variant="cta">
          <Link to="/admin/events/new">
            <Plus aria-hidden /> New event
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Status"
          options={tabs}
          value={filters.status}
          onChange={(status) => update('status', status)}
        />
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events"
            aria-label="Search events"
            className="pl-9"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        {events.isPending ? (
          <p className="flex items-center gap-2 p-5 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden /> Loading events…
          </p>
        ) : events.isError ? (
          <div className="p-5">
            <FormAlert message={events.error.message} />
          </div>
        ) : events.data.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <CalendarPlus className="size-10 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <p className="font-display text-lg font-semibold">
              {filters.q || filters.status ? 'No events match' : 'No events yet'}
            </p>
            {!filters.q && !filters.status && (
              <Button asChild>
                <Link to="/admin/events/new">Create the first one</Link>
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y">
            {events.data.map((event) => (
              <li key={event.id}>
                <Link
                  to={`/admin/events/${event.id}`}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/60 md:px-5"
                >
                  <EventCover
                    event={event}
                    shared={false}
                    className="hidden aspect-video w-24 shrink-0 rounded-md sm:block"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{event.title}</p>
                    <p className="tabular truncate text-sm text-muted-foreground">
                      {formatEventWhen(event.startsAt, event.endsAt)}
                    </p>
                    <p className="truncate text-sm text-muted-foreground md:hidden">
                      {event.venue}
                    </p>
                  </div>
                  <p className="hidden w-40 truncate text-sm text-muted-foreground md:block">
                    {event.venue}
                  </p>
                  <p className="tabular hidden w-24 text-right text-sm lg:block">
                    {formatPrice(event.priceCents)}
                  </p>
                  <p className="tabular hidden w-20 text-right text-sm text-muted-foreground lg:block">
                    {event.ticketsSold}/{event.capacity}
                  </p>
                  <div className="w-28 shrink-0 text-right">
                    <EventStatusBadge event={event} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
