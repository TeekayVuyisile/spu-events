import { ADMIN_USER_PAGE_SIZE, type AdminUserListQuery, type UserStatus } from '@monthati/shared';
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { Executor } from '../../db/client';
import { events, tickets, users } from '../../db/schema';

/** ILIKE pattern that treats the admin's % and _ as literal characters. */
const contains = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function adminUsersRepository(db: Executor) {
  return {
    /** One page plus the total match count (a window count, so one query). */
    async list({ q, role, status, page }: AdminUserListQuery) {
      const where: (SQL | undefined)[] = [];
      if (q) {
        const p = contains(q);
        where.push(
          or(
            ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, p),
            ilike(users.email, p),
            ilike(users.studentNumber, p),
          ),
        );
      }
      if (role) where.push(eq(users.role, role));
      if (status) where.push(eq(users.status, status));

      return db
        .select({
          id: users.id,
          role: users.role,
          status: users.status,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          studentNumber: users.studentNumber,
          createdAt: users.createdAt,
          total: sql<number>`(count(*) over ())::int`,
        })
        .from(users)
        .where(and(...where))
        .orderBy(desc(users.createdAt), desc(users.id))
        .limit(ADMIN_USER_PAGE_SIZE)
        .offset((page - 1) * ADMIN_USER_PAGE_SIZE);
    },

    async stats(userId: string) {
      const {
        rows: [row],
      } = await db.execute<{
        active_tickets: number;
        attended: number;
        comments: number;
        reports_against: number;
      }>(sql`
        select
          (select count(*)::int from tickets where user_id = ${userId} and status = 'valid') as active_tickets,
          (select count(*)::int from tickets where user_id = ${userId} and status = 'used') as attended,
          (select count(*)::int from comments where user_id = ${userId} and deleted_at is null) as comments,
          (select count(*)::int from reports where target_user_id = ${userId}) as reports_against
      `);
      return {
        activeTickets: row!.active_tickets,
        attended: row!.attended,
        comments: row!.comments,
        reportsAgainst: row!.reports_against,
      };
    },

    async tickets(userId: string, limit = 20) {
      return db
        .select({
          id: tickets.id,
          code: tickets.code,
          status: tickets.status,
          pricePaidCents: tickets.pricePaidCents,
          createdAt: tickets.createdAt,
          eventId: events.id,
          eventTitle: events.title,
          eventStartsAt: events.startsAt,
        })
        .from(tickets)
        .innerJoin(events, eq(events.id, tickets.eventId))
        .where(eq(tickets.userId, userId))
        .orderBy(desc(tickets.createdAt))
        .limit(limit);
    },

    /** Conditional, so two admins clicking at once can't both apply. Returns false if it didn't. */
    async setStatus(userId: string, from: UserStatus, to: UserStatus) {
      const rows = await db
        .update(users)
        .set({ status: to })
        .where(and(eq(users.id, userId), eq(users.status, from)))
        .returning({ id: users.id });
      return rows.length > 0;
    },
  };
}
