import { asc, eq, ne, and } from 'drizzle-orm';
import type { Executor } from '../../db/client';
import { tickets, users } from '../../db/schema';

export function attendeesRepository(db: Executor) {
  return {
    /** Everyone holding an active (valid or used) ticket, by surname. */
    async forEvent(eventId: string) {
      return db
        .select({
          ticketId: tickets.id,
          code: tickets.code,
          status: tickets.status,
          pricePaidCents: tickets.pricePaidCents,
          purchasedAt: tickets.createdAt,
          checkedInAt: tickets.checkedInAt,
          checkedInGate: tickets.checkedInGate,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          studentNumber: users.studentNumber,
        })
        .from(tickets)
        .innerJoin(users, eq(users.id, tickets.userId))
        .where(and(eq(tickets.eventId, eventId), ne(tickets.status, 'cancelled')))
        .orderBy(asc(users.lastName), asc(users.firstName), asc(tickets.id));
    },
  };
}
