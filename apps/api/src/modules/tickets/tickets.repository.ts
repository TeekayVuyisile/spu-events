import type { TicketCancelReason, TicketScope } from '@monthati/shared';
import { and, asc, desc, eq, getTableColumns, gte, lt, ne, or, sql } from 'drizzle-orm';
import type { Executor } from '../../db/client';
import { events, tickets } from '../../db/schema';
import { eventColumns } from '../events/events.repository';

/** A ticket together with its event (including the event's live sales count). */
const ticketWithEvent = {
  ticket: getTableColumns(tickets),
  event: eventColumns,
};

export function ticketsRepository(db: Executor) {
  return {
    async insert(values: typeof tickets.$inferInsert) {
      const [row] = await db.insert(tickets).values(values).returning();
      return row!;
    },

    async findActive(eventId: string, userId: string) {
      const [row] = await db
        .select()
        .from(tickets)
        .where(
          and(
            eq(tickets.eventId, eventId),
            eq(tickets.userId, userId),
            ne(tickets.status, 'cancelled'),
          ),
        );
      return row;
    },

    async findForUser(id: string, userId: string) {
      const [row] = await db
        .select(ticketWithEvent)
        .from(tickets)
        .innerJoin(events, eq(events.id, tickets.eventId))
        .where(and(eq(tickets.id, id), eq(tickets.userId, userId)));
      return row;
    },

    /**
     * Upcoming: active tickets for events that haven't ended, soonest first.
     * Past: everything else (ended events and cancelled tickets), newest first.
     */
    async listForUser(userId: string, scope: TicketScope, now = new Date()) {
      const upcoming = and(gte(events.endsAt, now), ne(tickets.status, 'cancelled'));
      return db
        .select(ticketWithEvent)
        .from(tickets)
        .innerJoin(events, eq(events.id, tickets.eventId))
        .where(
          and(
            eq(tickets.userId, userId),
            scope === 'upcoming'
              ? upcoming
              : or(lt(events.endsAt, now), eq(tickets.status, 'cancelled')),
          ),
        )
        .orderBy(scope === 'upcoming' ? asc(events.startsAt) : desc(events.startsAt))
        .limit(100);
    },

    /** valid → cancelled in one conditional UPDATE; undefined if it wasn't valid any more. */
    async cancel(id: string, reason: TicketCancelReason) {
      const [row] = await db
        .update(tickets)
        .set({ status: 'cancelled', cancelReason: reason, cancelledAt: sql`now()` })
        .where(and(eq(tickets.id, id), eq(tickets.status, 'valid')))
        .returning();
      return row;
    },

    /** Holders of valid tickets, for announcing changes to an event. */
    async validHolderIds(eventId: string) {
      const rows = await db
        .selectDistinct({ userId: tickets.userId })
        .from(tickets)
        .where(and(eq(tickets.eventId, eventId), eq(tickets.status, 'valid')));
      return rows.map((r) => r.userId);
    },

    /** Cancels every valid ticket for an event and returns them (for refunds). */
    async cancelAllForEvent(eventId: string) {
      return db
        .update(tickets)
        .set({ status: 'cancelled', cancelReason: 'event_cancelled', cancelledAt: sql`now()` })
        .where(and(eq(tickets.eventId, eventId), eq(tickets.status, 'valid')))
        .returning();
    },
  };
}

export type TicketsRepository = ReturnType<typeof ticketsRepository>;
