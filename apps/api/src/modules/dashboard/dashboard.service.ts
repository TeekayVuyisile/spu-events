import {
  DASHBOARD_RANGE_DAYS,
  isoToCampusInput,
  type Dashboard,
  type DashboardRange,
} from '@spu-events/shared';
import type { Db } from '../../db/client';
import { dashboardRepository } from './dashboard.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Campus midnight `days - 1` days before today, so the range covers whole days including today. */
export function rangeStart(days: number, now = new Date()) {
  const today = isoToCampusInput(now.toISOString()).slice(0, 10);
  return new Date(new Date(`${today}T00:00:00+02:00`).getTime() - (days - 1) * DAY_MS);
}

export function dashboardService({ db }: { db: Db }) {
  const repo = dashboardRepository(db);

  return {
    async get(range: DashboardRange, now = new Date()): Promise<Dashboard> {
      const days = DASHBOARD_RANGE_DAYS[range];
      const from = rangeStart(days, now);
      const previousFrom = new Date(from.getTime() - days * DAY_MS);

      const [current, previous, daily, byCategory, topEvents, attention] = await Promise.all([
        repo.totals(from, now),
        repo.totals(previousFrom, from),
        repo.daily(from),
        repo.byCategory(from),
        repo.topEvents(from),
        repo.attention(),
      ]);
      const rate = (t: typeof current) => (t.attendable ? t.checked_in / t.attendable : null);

      return {
        range,
        kpis: {
          revenueCents: { value: current.revenue_cents, previous: previous.revenue_cents },
          ticketsSold: { value: current.tickets_sold, previous: previous.tickets_sold },
          checkInRate: { value: rate(current), previous: rate(previous) },
          activeStudents: { value: current.active_students, previous: previous.active_students },
        },
        daily: daily.map((d) => ({
          date: d.date,
          tickets: d.tickets,
          revenueCents: d.revenue_cents,
        })),
        byCategory,
        topEvents: topEvents.map((e) => ({
          id: e.id,
          title: e.title,
          startsAt: e.starts_at,
          capacity: e.capacity,
          ticketsSold: e.tickets_sold,
          checkedIn: e.checked_in,
          revenueCents: e.revenue_cents,
        })),
        attention: {
          openReports: attention.open_reports,
          pendingVolunteers: attention.pending_volunteers,
          draftEvents: attention.draft_events,
        },
      };
    },
  };
}

export type DashboardService = ReturnType<typeof dashboardService>;
