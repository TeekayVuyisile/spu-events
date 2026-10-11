import type { ScanResultKind } from '@spu-events/shared';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Executor } from '../../db/client';
import { events, eventStaff, scanLogs, tickets, users } from '../../db/schema';
import { eventColumns, ticketsSoldSql } from '../events/events.repository';

// Raw, fully qualified SQL for the same reason as ticketsSoldSql (see events.repository.ts).
const checkedInSql = sql<number>`(select count(*)::int from tickets t where t.event_id = "events"."id" and t.status = 'used')`;

const holder = alias(users, 'holder');
const checker = alias(users, 'checker');

/** A ticket with what the gate needs to say about it. */
const ticketForGate = {
  id: tickets.id,
  code: tickets.code,
  eventId: tickets.eventId,
  status: tickets.status,
  checkedInAt: tickets.checkedInAt,
  checkedInGate: tickets.checkedInGate,
  holderFirstName: holder.firstName,
  holderLastName: holder.lastName,
  holderAvatarUrl: holder.avatarUrl,
  checkerFirstName: checker.firstName,
  checkerLastName: checker.lastName,
};

export function gateRepository(db: Executor) {
  async function findTicket(where: ReturnType<typeof eq>) {
    const [row] = await db
      .select(ticketForGate)
      .from(tickets)
      .innerJoin(holder, eq(holder.id, tickets.userId))
      .leftJoin(checker, eq(checker.id, tickets.checkedInById))
      .where(where);
    return row;
  }

  return {
    async isAssigned(eventId: string, userId: string) {
      const [row] = await db
        .select({ userId: eventStaff.userId })
        .from(eventStaff)
        .where(and(eq(eventStaff.eventId, eventId), eq(eventStaff.userId, userId)));
      return Boolean(row);
    },

    /**
     * Published events a scanner can work: running now or starting within a week.
     * Pass `staffId` to limit to that person's assignments (admins see all).
     */
    async listGateEvents(staffId: string | null, now = new Date()) {
      const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const base = db
        .select({
          ...eventColumns,
          checkedIn: checkedInSql,
        })
        .from(events);
      const query = staffId
        ? base.innerJoin(
            eventStaff,
            and(eq(eventStaff.eventId, events.id), eq(eventStaff.userId, staffId)),
          )
        : base;
      return query
        .where(
          and(
            eq(events.status, 'published'),
            gte(events.endsAt, now),
            lte(events.startsAt, weekAhead),
          ),
        )
        .orderBy(asc(events.startsAt))
        .limit(50);
    },

    async findGateEvent(eventId: string) {
      const [row] = await db
        .select({
          ...eventColumns,
          checkedIn: checkedInSql,
        })
        .from(events)
        .where(eq(events.id, eventId));
      return row;
    },

    findTicketById: (id: string) => findTicket(eq(tickets.id, id)),
    findTicketByCode: (code: string) => findTicket(eq(tickets.code, code)),

    /**
     * The check-in itself: one conditional UPDATE. Only a ticket that is still
     * valid, for this event, flips to used, so two gates scanning the same code
     * at the same instant can't both admit it. Returns undefined otherwise.
     */
    async checkIn(ticketId: string, eventId: string, staffId: string, gate: string | null) {
      const [row] = await db
        .update(tickets)
        .set({
          status: 'used',
          checkedInAt: sql`now()`,
          checkedInById: staffId,
          checkedInGate: gate,
        })
        .where(
          and(eq(tickets.id, ticketId), eq(tickets.eventId, eventId), eq(tickets.status, 'valid')),
        )
        .returning({ id: tickets.id });
      return row;
    },

    async stats(eventId: string) {
      const [row] = await db
        .select({ checkedIn: checkedInSql, ticketsSold: ticketsSoldSql, capacity: events.capacity })
        .from(events)
        .where(eq(events.id, eventId));
      return row!;
    },

    async log(values: {
      eventId: string;
      ticketId: string | null;
      staffId: string;
      result: ScanResultKind;
      gate: string | null;
    }) {
      const [row] = await db.insert(scanLogs).values(values).returning({ id: scanLogs.id });
      return row!.id;
    },

    async recentScans(eventId: string, limit = 20) {
      const staff = alias(users, 'staff');
      return db
        .select({
          id: scanLogs.id,
          result: scanLogs.result,
          gate: scanLogs.gate,
          createdAt: scanLogs.createdAt,
          ticketCode: tickets.code,
          holderFirstName: holder.firstName,
          holderLastName: holder.lastName,
          staffFirstName: staff.firstName,
          staffLastName: staff.lastName,
        })
        .from(scanLogs)
        .leftJoin(tickets, eq(tickets.id, scanLogs.ticketId))
        .leftJoin(holder, eq(holder.id, tickets.userId))
        .leftJoin(staff, eq(staff.id, scanLogs.staffId))
        .where(eq(scanLogs.eventId, eventId))
        .orderBy(desc(scanLogs.createdAt), desc(scanLogs.id))
        .limit(limit);
    },

    // ── Staff assignment ──

    async listStaffUsers() {
      return db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
        })
        .from(users)
        .where(and(eq(users.role, 'staff'), eq(users.status, 'active')))
        .orderBy(asc(users.firstName), asc(users.lastName));
    },

    async assignedStaff(eventId: string) {
      return db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
        })
        .from(eventStaff)
        .innerJoin(users, eq(users.id, eventStaff.userId))
        .where(eq(eventStaff.eventId, eventId))
        .orderBy(asc(users.firstName));
    },

    /** Replaces the event's staff list with `userIds` (already checked to be staff). */
    async replaceAssignments(eventId: string, userIds: string[]) {
      await db.delete(eventStaff).where(eq(eventStaff.eventId, eventId));
      if (userIds.length) {
        await db.insert(eventStaff).values(userIds.map((userId) => ({ eventId, userId })));
      }
    },

    async countStaff(userIds: string[]) {
      if (!userIds.length) return 0;
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(users)
        .where(and(inArray(users.id, userIds), eq(users.role, 'staff')));
      return row!.n;
    },
  };
}

export type GateRepository = ReturnType<typeof gateRepository>;
