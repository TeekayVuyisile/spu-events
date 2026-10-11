import { CAMPUS_TZ, type EventCategory } from '@spu-events/shared';
import { sql } from 'drizzle-orm';
import type { Executor } from '../../db/client';

/**
 * Read-only reporting queries. Written as SQL because they are aggregates over
 * several tables. Revenue is ticket purchases minus refunds from the ledger (in
 * cents), so it always agrees with what students were actually charged.
 */
export function dashboardRepository(db: Executor) {
  const rows = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) =>
    (await db.execute<T>(query)).rows;

  return {
    /** The four KPIs for [from, to). */
    async totals(from: Date, to: Date) {
      const f = from.toISOString();
      const t = to.toISOString();
      const [row] = await rows<{
        revenue_cents: number;
        tickets_sold: number;
        checked_in: number;
        attendable: number;
        active_students: number;
      }>(sql`
        select
          (select coalesce(-sum(amount_cents), 0)::int from wallet_ledger
            where kind in ('ticket_purchase', 'ticket_refund')
              and created_at >= ${f}::timestamptz and created_at < ${t}::timestamptz) as revenue_cents,
          (select count(*)::int from tickets
            where status <> 'cancelled'
              and created_at >= ${f}::timestamptz and created_at < ${t}::timestamptz) as tickets_sold,
          (select count(*) filter (where tk.status = 'used')::int from tickets tk
            join events e on e.id = tk.event_id
            where e.status = 'published' and tk.status <> 'cancelled'
              and e.ends_at >= ${f}::timestamptz and e.ends_at < least(${t}::timestamptz, now())) as checked_in,
          (select count(*)::int from tickets tk
            join events e on e.id = tk.event_id
            where e.status = 'published' and tk.status <> 'cancelled'
              and e.ends_at >= ${f}::timestamptz and e.ends_at < least(${t}::timestamptz, now())) as attendable,
          (select count(distinct a.user_id)::int from (
              select user_id from tickets where created_at >= ${f}::timestamptz and created_at < ${t}::timestamptz
              union all
              select user_id from event_likes where created_at >= ${f}::timestamptz and created_at < ${t}::timestamptz
              union all
              select user_id from comments where created_at >= ${f}::timestamptz and created_at < ${t}::timestamptz
              union all
              select user_id from photos where created_at >= ${f}::timestamptz and created_at < ${t}::timestamptz
            ) a join users u on u.id = a.user_id and u.role = 'student') as active_students
      `);
      return row!;
    },

    /** One row per campus-time day from `from` to today, gaps filled with zeros. */
    async daily(from: Date) {
      const f = from.toISOString();
      return rows<{ date: string; tickets: number; revenue_cents: number }>(sql`
        with days as (
          select generate_series(
            (${f}::timestamptz at time zone ${CAMPUS_TZ})::date,
            (now() at time zone ${CAMPUS_TZ})::date,
            interval '1 day'
          )::date as day
        ),
        sold as (
          select (created_at at time zone ${CAMPUS_TZ})::date as day, count(*)::int as n
          from tickets
          where status <> 'cancelled' and created_at >= ${f}::timestamptz
          group by 1
        ),
        revenue as (
          select (created_at at time zone ${CAMPUS_TZ})::date as day, -sum(amount_cents)::int as cents
          from wallet_ledger
          where kind in ('ticket_purchase', 'ticket_refund') and created_at >= ${f}::timestamptz
          group by 1
        )
        select to_char(days.day, 'YYYY-MM-DD') as date,
               coalesce(sold.n, 0) as tickets,
               coalesce(revenue.cents, 0) as revenue_cents
        from days
        left join sold using (day)
        left join revenue using (day)
        order by days.day
      `);
    },

    async byCategory(from: Date) {
      return rows<{ category: EventCategory; tickets: number }>(sql`
        select e.category, count(*)::int as tickets
        from tickets t join events e on e.id = t.event_id
        where t.status <> 'cancelled' and t.created_at >= ${from.toISOString()}::timestamptz
        group by e.category
        order by tickets desc, e.category
      `);
    },

    /** Best sellers among published events starting from `from` onwards (past and upcoming). */
    async topEvents(from: Date, limit = 5) {
      return rows<{
        id: string;
        title: string;
        starts_at: string;
        capacity: number;
        tickets_sold: number;
        checked_in: number;
        revenue_cents: number;
      }>(sql`
        select e.id, e.title, e.capacity,
               to_char(e.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as starts_at,
               count(t.id)::int as tickets_sold,
               count(t.id) filter (where t.status = 'used')::int as checked_in,
               coalesce(sum(t.price_paid_cents), 0)::int as revenue_cents
        from events e
        left join tickets t on t.event_id = e.id and t.status <> 'cancelled'
        where e.status = 'published' and e.starts_at >= ${from.toISOString()}::timestamptz
        group by e.id
        having count(t.id) > 0
        order by tickets_sold desc, e.starts_at
        limit ${limit}
      `);
    },

    /** Work waiting for an admin. */
    async attention() {
      const [row] = await rows<{
        open_reports: number;
        pending_volunteers: number;
        draft_events: number;
      }>(sql`
        select
          (select count(distinct (target_type, target_id))::int from reports where status = 'open') as open_reports,
          (select count(*)::int from volunteer_applications v join events e on e.id = v.event_id
            where v.status = 'pending' and e.status = 'published' and e.ends_at > now()) as pending_volunteers,
          (select count(*)::int from events where status = 'draft') as draft_events
      `);
      return row!;
    },
  };
}
