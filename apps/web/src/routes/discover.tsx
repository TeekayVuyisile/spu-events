import {
  CATEGORY_LABELS,
  EVENT_CATEGORIES,
  eventListQuerySchema,
  type EventCategory,
  type WhenFilter,
} from '@monthati/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search, SearchX } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { EventCard } from '@/components/events/event-card';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { discoverQuery, type DiscoverFilters } from '@/lib/events';
import { cn } from '@/lib/utils';

const WHEN_LABELS: Record<WhenFilter, string> = {
  upcoming: 'Upcoming',
  'this-week': 'This week',
  'this-month': 'This month',
  past: 'Past',
};

/** Filters live in the URL, so a filtered view can be shared and survives a reload. */
function useFilters() {
  const [params, setParams] = useSearchParams();
  const { page: _page, ...filters } = eventListQuerySchema.parse(Object.fromEntries(params));

  const setFilter = (key: keyof DiscoverFilters, value: string | undefined) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value && !(key === 'when' && value === 'upcoming')) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  };
  const clear = () => setParams(new URLSearchParams(), { replace: true, preventScrollReset: true });
  return { filters, setFilter, clear };
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-11 shrink-0 cursor-pointer rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Skeleton className="aspect-video rounded-none" />
      <div className="flex gap-4 p-4">
        <Skeleton className="h-14 w-12" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
    </div>
  );
}

export function DiscoverPage() {
  const { filters, setFilter, clear } = useFilters();
  const [search, setSearch] = useState(filters.q ?? '');

  // Debounce typing into the URL (and so into the query).
  useEffect(() => {
    const id = setTimeout(() => {
      if ((filters.q ?? '') !== search.trim()) setFilter('q', search.trim() || undefined);
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the input
  }, [search]);

  const query = useInfiniteQuery(discoverQuery(filters));
  const events = query.data?.pages.flatMap((p) => p.events) ?? [];
  const filtered = Boolean(
    filters.q || filters.category || filters.price || filters.when !== 'upcoming',
  );

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold md:text-5xl">
            What’s on at <span className="text-primary">SPU</span>
          </h1>
          <p className="text-lg text-muted-foreground">Find your next night out, game or talk.</p>
        </div>

        <div className="relative max-w-xl">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events, venues…"
            aria-label="Search events"
            className="h-12 pl-11"
          />
        </div>

        <div className="space-y-3">
          <div
            role="group"
            aria-label="When"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]"
          >
            {(Object.keys(WHEN_LABELS) as WhenFilter[]).map((when) => (
              <Chip
                key={when}
                active={filters.when === when}
                onClick={() => setFilter('when', when)}
              >
                {WHEN_LABELS[when]}
              </Chip>
            ))}
            <span className="mx-1 w-px shrink-0 bg-border" aria-hidden />
            <Chip
              active={filters.price === 'free'}
              onClick={() => setFilter('price', filters.price === 'free' ? undefined : 'free')}
            >
              Free
            </Chip>
            <Chip
              active={filters.price === 'paid'}
              onClick={() => setFilter('price', filters.price === 'paid' ? undefined : 'paid')}
            >
              Paid
            </Chip>
          </div>
          <div
            role="group"
            aria-label="Category"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]"
          >
            <Chip active={!filters.category} onClick={() => setFilter('category', undefined)}>
              All
            </Chip>
            {EVENT_CATEGORIES.map((category: EventCategory) => (
              <Chip
                key={category}
                active={filters.category === category}
                onClick={() =>
                  setFilter('category', filters.category === category ? undefined : category)
                }
              >
                {CATEGORY_LABELS[category]}
              </Chip>
            ))}
          </div>
        </div>
      </section>

      <section aria-label="Events" aria-busy={query.isPending}>
        {query.isPending ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : query.isError ? (
          <FormAlert message={query.error.message} />
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
            <SearchX className="size-10 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <p className="font-display text-xl font-semibold">
              {filtered ? 'Nothing matches those filters' : 'No events yet'}
            </p>
            <p className="text-muted-foreground">
              {filtered
                ? 'Try another search or clear a filter.'
                : 'Check back soon. New events are added every week.'}
            </p>
            {filtered && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('');
                  clear();
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Keyed by filters so the stagger replays for a new result set, not on "show more". */}
            <Stagger
              key={JSON.stringify(filters)}
              className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              {events.map((event) => (
                <StaggerItem key={event.id}>
                  <EventCard event={event} />
                </StaggerItem>
              ))}
            </Stagger>
            {query.hasNextPage && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  loading={query.isFetchingNextPage}
                  onClick={() => query.fetchNextPage()}
                >
                  Show more events
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
