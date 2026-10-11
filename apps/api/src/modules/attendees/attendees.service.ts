import { CAMPUS_TZ, type AttendeeList } from '@monthati/shared';
import type { Db } from '../../db/client';
import { toCsv } from '../../lib/csv';
import { AppError } from '../../lib/errors';
import { eventsRepository } from '../events/events.repository';
import { attendeesRepository } from './attendees.repository';

/** "2026-10-24 19:05" in campus time: what spreadsheets sort and read cleanly. */
const campusStamp = new Intl.DateTimeFormat('sv-SE', {
  timeZone: CAMPUS_TZ,
  dateStyle: 'short',
  timeStyle: 'short',
});

export function attendeesService({ db }: { db: Db }) {
  async function list(eventId: string): Promise<AttendeeList> {
    const event = await eventsRepository(db).findById(eventId);
    if (!event) throw AppError.notFound('Event not found');
    const rows = await attendeesRepository(db).forEvent(eventId);
    return {
      event: { id: event.id, title: event.title, capacity: event.capacity },
      attendees: rows.map((r) => ({
        ticketId: r.ticketId,
        code: r.code,
        status: r.status,
        name: `${r.firstName} ${r.lastName}`,
        email: r.email,
        studentNumber: r.studentNumber,
        pricePaidCents: r.pricePaidCents,
        purchasedAt: r.purchasedAt.toISOString(),
        checkedInAt: r.checkedInAt?.toISOString() ?? null,
        checkedInGate: r.checkedInGate,
      })),
    };
  }

  return {
    list,

    async csv(eventId: string) {
      const { event, attendees } = await list(eventId);
      const body = toCsv(
        [
          'Name',
          'Student number',
          'Email',
          'Ticket code',
          'Paid (R)',
          'Bought',
          'Checked in',
          'Gate',
        ],
        attendees.map((a) => [
          a.name,
          a.studentNumber,
          a.email,
          a.code,
          (a.pricePaidCents / 100).toFixed(2),
          campusStamp.format(new Date(a.purchasedAt)),
          a.checkedInAt ? campusStamp.format(new Date(a.checkedInAt)) : null,
          a.checkedInGate,
        ]),
      );
      const slug = event.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      return { filename: `${slug || 'event'}-attendees.csv`, body };
    },
  };
}

export type AttendeesService = ReturnType<typeof attendeesService>;
