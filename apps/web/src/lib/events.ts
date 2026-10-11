import {
  formatCents,
  type AdminEvent,
  type AdminEventListQuery,
  type EventDetail,
  type EventListQuery,
  type EventPage,
  type EventSummary,
} from '@monthati/shared';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type DiscoverFilters = Omit<EventListQuery, 'page'>;

function toSearch(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const eventKeys = {
  all: ['events'] as const,
  list: (filters: DiscoverFilters) => ['events', 'list', filters] as const,
  detail: (slug: string) => ['events', 'detail', slug] as const,
  admin: ['admin', 'events'] as const,
  adminList: (query: AdminEventListQuery) => ['admin', 'events', 'list', query] as const,
  adminDetail: (id: string) => ['admin', 'events', 'detail', id] as const,
};

export const discoverQuery = (filters: DiscoverFilters) =>
  infiniteQueryOptions({
    queryKey: eventKeys.list(filters),
    queryFn: ({ pageParam }) =>
      api<EventPage>(`/events${toSearch({ ...filters, page: pageParam })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage,
  });

export const eventQuery = (slug: string) =>
  queryOptions({
    queryKey: eventKeys.detail(slug),
    queryFn: () => api<{ event: EventDetail }>(`/events/${encodeURIComponent(slug)}`),
    select: (data) => data.event,
  });

export const adminEventsQuery = (query: AdminEventListQuery) =>
  queryOptions({
    queryKey: eventKeys.adminList(query),
    queryFn: () => api<{ events: AdminEvent[] }>(`/admin/events${toSearch(query)}`),
    select: (data) => data.events,
  });

export const adminEventQuery = (id: string) =>
  queryOptions({
    queryKey: eventKeys.adminDetail(id),
    queryFn: () => api<{ event: AdminEvent }>(`/admin/events/${id}`),
    select: (data) => data.event,
  });

export function formatPrice(cents: number) {
  return cents === 0 ? 'Free' : formatCents(cents);
}

export function hasEnded(event: Pick<EventSummary, 'endsAt'>) {
  return new Date(event.endsAt) < new Date();
}

export function isLive(event: Pick<EventSummary, 'startsAt' | 'endsAt'>) {
  const now = new Date();
  return new Date(event.startsAt) <= now && now <= new Date(event.endsAt);
}
