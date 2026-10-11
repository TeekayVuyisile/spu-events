import type { AdminEvent, EventDetail, EventSummary } from '@monthati/shared';
import type { EventRow } from '../../db/schema';
import type { StorageService } from '../../lib/storage';

/** An event row as the repository reads it: with the live count of active tickets. */
export type EventWithSold = EventRow & { ticketsSold: number };

/** Turns event rows into the API shapes. Shared by the events and tickets modules. */
export function eventMappers(storage: StorageService) {
  const toSummary = (e: EventWithSold): EventSummary => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    category: e.category,
    venue: e.venue,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    priceCents: e.priceCents,
    capacity: e.capacity,
    ticketsSold: e.ticketsSold,
    status: e.status,
    coverUrl: e.coverKey ? storage.url(e.coverKey) : null,
  });

  const toDetail = (e: EventWithSold, myTicketId: string | null = null): EventDetail => ({
    ...toSummary(e),
    description: e.description,
    volunteersWanted: e.volunteersWanted,
    cancelledAt: e.cancelledAt?.toISOString() ?? null,
    cancellationReason: e.cancellationReason,
    myTicketId,
  });

  const toAdmin = (e: EventWithSold): AdminEvent => ({
    ...toDetail(e),
    publishedAt: e.publishedAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  });

  return { toSummary, toDetail, toAdmin };
}
