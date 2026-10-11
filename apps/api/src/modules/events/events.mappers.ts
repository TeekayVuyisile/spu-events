import type { AdminEvent, EventDetail, EventSummary } from '@spu-events/shared';
import type { EventRow } from '../../db/schema';
import type { StorageService } from '../../lib/storage';

/** An event row as the repository reads it: with the live count of active tickets. */
export type EventWithSold = EventRow & { ticketsSold: number; likeCount: number };

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
    likeCount: e.likeCount,
    status: e.status,
    coverUrl: e.coverKey ? storage.url(e.coverKey) : null,
  });

  const toDetail = (
    e: EventWithSold,
    viewer: { myTicketId: string | null; likedByMe: boolean } = {
      myTicketId: null,
      likedByMe: false,
    },
  ): EventDetail => ({
    ...toSummary(e),
    description: e.description,
    location:
      e.latitude !== null && e.longitude !== null && e.address !== null
        ? { lat: e.latitude, lng: e.longitude, address: e.address }
        : null,
    volunteersWanted: e.volunteersWanted,
    cancelledAt: e.cancelledAt?.toISOString() ?? null,
    cancellationReason: e.cancellationReason,
    ...viewer,
  });

  const toAdmin = (e: EventWithSold): AdminEvent => ({
    ...toDetail(e),
    publishedAt: e.publishedAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  });

  return { toSummary, toDetail, toAdmin };
}
