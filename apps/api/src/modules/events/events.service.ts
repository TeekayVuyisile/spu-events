import {
  formatCents,
  formatEventWhen,
  type AdminEventListQuery,
  type EventInput,
  type EventListQuery,
  type EventLocation,
  type EventPage,
} from '@spu-events/shared';
import { randomBytes } from 'node:crypto';
import type { Db } from '../../db/client';
import { uniqueViolation } from '../../lib/db-errors';
import { AppError } from '../../lib/errors';
import { detectImage } from '../../lib/image';
import type { StorageService } from '../../lib/storage';
import { notify } from '../notifications/notifications.repository';
import { refundTickets } from '../tickets/tickets.service';
import { socialRepository } from '../social/social.repository';
import { ticketsRepository } from '../tickets/tickets.repository';
import { eventMappers } from './events.mappers';
import { eventsRepository } from './events.repository';

/** "Spring Formal 2026!" → "spring-formal-2026-k3x9". The suffix keeps slugs unique. */
export function makeSlug(title: string) {
  const base =
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50)
      .replace(/-+$/, '') || 'event';
  return `${base}-${randomBytes(3).toString('hex').slice(0, 4)}`;
}

/** The optional map pin as table columns: all three set, or all null. */
function locationColumns(location: EventLocation | null) {
  return location
    ? { latitude: location.lat, longitude: location.lng, address: location.address }
    : { latitude: null, longitude: null, address: null };
}

const notFound = () => AppError.notFound('Event not found');

const startInPast = () =>
  AppError.badRequest('Some fields need attention', {
    startsAt: ['The start must be in the future'],
  });

export function eventsService({ db, storage }: { db: Db; storage: StorageService }) {
  const repo = eventsRepository(db);

  const { toSummary, toDetail, toAdmin } = eventMappers(storage);

  async function getOrThrow(id: string) {
    const event = await repo.findById(id);
    if (!event) throw notFound();
    return event;
  }

  /** Re-reads after a write, so responses include the live ticket count. */
  async function reload(id: string) {
    return toAdmin(await getOrThrow(id));
  }

  /** Explains why a status change didn't apply, given the event's current state. */
  async function transitionError(id: string, action: string) {
    const event = await getOrThrow(id);
    return AppError.conflict(`Can’t ${action} an event that is ${event.status}`);
  }

  /** Inserts with a fresh slug, retrying on the (very unlikely) slug collision. */
  async function insertWithSlug(values: Omit<Parameters<typeof repo.insert>[0], 'slug'>) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await repo.insert({ ...values, slug: makeSlug(values.title) });
      } catch (err) {
        if (uniqueViolation(err)?.includes('slug') && attempt < 3) continue;
        throw err;
      }
    }
  }

  return {
    // ── Public ──────────────────────────────────────────────

    async listPublished(query: EventListQuery): Promise<EventPage> {
      const { rows, nextPage } = await repo.listPublished(query);
      return { events: rows.map(toSummary), nextPage };
    },

    /** Drafts are invisible to the public. Cancelled events stay viewable so ticket holders see why. */
    async getPublished(slug: string, viewerId?: string) {
      const event = await repo.findBySlug(slug);
      if (!event || event.status === 'draft') throw notFound();
      if (!viewerId) return toDetail(event);
      const [mine, likes] = await Promise.all([
        ticketsRepository(db).findActive(event.id, viewerId),
        socialRepository(db).eventLikeState(event.id, viewerId),
      ]);
      return toDetail(event, { myTicketId: mine?.id ?? null, likedByMe: likes.liked });
    },

    // ── Admin ───────────────────────────────────────────────

    async listForAdmin(query: AdminEventListQuery) {
      return (await repo.listForAdmin(query)).map(toAdmin);
    },

    async get(id: string) {
      return toAdmin(await getOrThrow(id));
    },

    /** New events always start as drafts. */
    async create(input: EventInput, adminId: string) {
      if (new Date(input.startsAt) <= new Date()) throw startInPast();
      const { location, ...fields } = input;
      const event = await insertWithSlug({
        ...fields,
        ...locationColumns(location),
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        createdById: adminId,
      });
      return reload(event.id);
    },

    async update(id: string, input: EventInput) {
      const current = await getOrThrow(id);
      if (current.status === 'cancelled') {
        throw AppError.conflict('Cancelled events can’t be edited');
      }
      // A start time already in the past may stay as it is, but can't be moved into the past.
      const startsAt = new Date(input.startsAt);
      if (startsAt.getTime() !== current.startsAt.getTime() && startsAt <= new Date()) {
        throw startInPast();
      }
      // Once tickets are sold, the price is locked (holders paid it) and capacity can't drop below sales.
      const fields: Record<string, string[]> = {};
      if (current.ticketsSold > 0 && input.priceCents !== current.priceCents) {
        fields.priceCents = ['The price is locked once tickets are sold'];
      }
      if (input.capacity < current.ticketsSold) {
        fields.capacity = [`${current.ticketsSold} tickets are already sold`];
      }
      if (Object.keys(fields).length) throw AppError.conflict('Some fields need attention', fields);

      const endsAt = new Date(input.endsAt);
      const moved =
        current.status === 'published' &&
        (startsAt.getTime() !== current.startsAt.getTime() ||
          endsAt.getTime() !== current.endsAt.getTime() ||
          input.venue !== current.venue ||
          (input.location?.lat ?? null) !== current.latitude ||
          (input.location?.lng ?? null) !== current.longitude);
      const { location, ...values } = input;

      await db.transaction(async (tx) => {
        await eventsRepository(tx).update(id, {
          ...values,
          ...locationColumns(location),
          startsAt,
          endsAt,
        });
        // Ticket holders need to know if when or where changed; other edits stay quiet.
        if (moved) {
          const holders = await ticketsRepository(tx).validHolderIds(id);
          await notify(
            tx,
            holders.map((userId) => ({
              userId,
              kind: 'event_changed' as const,
              title: `${input.title} has changed`,
              body: `Now ${formatEventWhen(startsAt.toISOString(), endsAt.toISOString())} at ${input.venue}. Your ticket is still valid.`,
              link: `/events/${current.slug}`,
            })),
          );
        }
      });
      return reload(id);
    },

    async publish(id: string) {
      const current = await getOrThrow(id);
      if (current.status === 'draft' && current.startsAt <= new Date()) {
        throw AppError.conflict('Move the start into the future before publishing');
      }
      const event = await repo.transition(id, 'draft', {
        status: 'published',
        publishedAt: new Date(),
      });
      if (!event) throw await transitionError(id, 'publish');
      return reload(id);
    },

    /** Back to draft, hiding it from students. Only before any tickets are sold. */
    async unpublish(id: string) {
      await db.transaction(async (tx) => {
        const event = await eventsRepository(tx).lock(id);
        if (!event) throw notFound();
        if (event.ticketsSold > 0) {
          throw AppError.conflict(
            'Tickets have been sold, so this event can’t go back to draft. Cancel it instead: that refunds everyone.',
          );
        }
        const done = await eventsRepository(tx).transition(id, 'published', {
          status: 'draft',
          publishedAt: null,
        });
        if (!done) throw AppError.conflict(`Can’t unpublish an event that is ${event.status}`);
      });
      return reload(id);
    },

    /**
     * Cancels the event and refunds every ticket holder in one transaction: either
     * everyone is refunded and the event is cancelled, or nothing changes.
     */
    async cancel(id: string, reason: string) {
      await db.transaction(async (tx) => {
        const event = await eventsRepository(tx).lock(id);
        if (!event) throw notFound();
        const done = await eventsRepository(tx).transition(id, 'published', {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: reason,
        });
        if (!done) throw AppError.conflict(`Can’t cancel an event that is ${event.status}`);
        const cancelled = await ticketsRepository(tx).cancelAllForEvent(id);
        await refundTickets(tx, cancelled);
        await notify(
          tx,
          cancelled.map((t) => ({
            userId: t.userId,
            kind: 'event_cancelled' as const,
            title: `${event.title} is cancelled`,
            body: `${reason}${t.pricePaidCents > 0 ? ` ${formatCents(t.pricePaidCents)} has been refunded to your wallet.` : ''}`,
            link: t.pricePaidCents > 0 ? '/wallet' : `/events/${event.slug}`,
          })),
        );
      });
      return reload(id);
    },

    /** Copies everything (including the cover image) into a new draft. */
    async duplicate(id: string, adminId: string) {
      const source = await getOrThrow(id);
      let coverKey: string | null = null;
      if (source.coverKey) {
        coverKey = source.coverKey.replace(
          /\/[^/]+(\.\w+)$/,
          `/copy-${randomBytes(8).toString('hex')}$1`,
        );
        await storage.copy(source.coverKey, coverKey);
      }
      const event = await insertWithSlug({
        title: `${source.title} (copy)`.slice(0, 120),
        description: source.description,
        category: source.category,
        venue: source.venue,
        startsAt: source.startsAt,
        endsAt: source.endsAt,
        capacity: source.capacity,
        priceCents: source.priceCents,
        volunteersWanted: source.volunteersWanted,
        latitude: source.latitude,
        longitude: source.longitude,
        address: source.address,
        coverKey,
        createdById: adminId,
      });
      return reload(event.id);
    },

    /** Only drafts can be deleted; published events are cancelled instead, keeping a record. */
    async remove(id: string) {
      const event = await repo.deleteDraft(id);
      if (!event) throw await transitionError(id, 'delete');
      if (event.coverKey) await storage.delete(event.coverKey);
    },

    async setCover(id: string, file: Buffer) {
      const current = await getOrThrow(id);
      if (current.status === 'cancelled') {
        throw AppError.conflict('Cancelled events can’t be edited');
      }
      const image = detectImage(file);
      if (!image) {
        throw AppError.badRequest('Upload a JPG, PNG or WebP image', {
          cover: ['Upload a JPG, PNG or WebP image'],
        });
      }

      const key = `events/${id}-${randomBytes(8).toString('hex')}.${image.ext}`;
      await storage.put(key, file, image.contentType);
      await repo.update(id, { coverKey: key });
      // Remove the old file only once the new one is saved and referenced.
      if (current.coverKey) await storage.delete(current.coverKey);
      return reload(id);
    },

    async removeCover(id: string) {
      const current = await getOrThrow(id);
      await repo.update(id, { coverKey: null });
      if (current.coverKey) await storage.delete(current.coverKey);
      return reload(id);
    },
  };
}

export type EventsService = ReturnType<typeof eventsService>;
