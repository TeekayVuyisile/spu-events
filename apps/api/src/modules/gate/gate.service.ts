import {
  DOORS_OPEN_HOURS,
  formatDay,
  formatTime,
  type GateEvent,
  type LiveGateUpdate,
  type Role,
  type ScanInput,
  type ScanLogEntry,
  type ScanResult,
  type ScanResultKind,
  type StaffMember,
} from '@monthati/shared';
import type { Db } from '../../db/client';
import { AppError } from '../../lib/errors';
import type { LiveBus } from '../../lib/live-bus';
import type { StorageService } from '../../lib/storage';
import type { TicketSigner } from '../../lib/ticket-signing';
import { eventMappers } from '../events/events.mappers';
import { gateRepository } from './gate.repository';

export interface Scanner {
  id: string;
  role: Role;
}

export const liveChannel = (eventId: string) => `gate:${eventId}`;

const fullName = (first: string | null, last: string | null) =>
  first ? `${first} ${last ?? ''}`.trim() : null;

export function gateService({
  db,
  storage,
  signer,
  bus,
}: {
  db: Db;
  storage: StorageService;
  signer: TicketSigner;
  bus: LiveBus;
}) {
  const repo = gateRepository(db);
  const { toSummary } = eventMappers(storage);

  /** Admins can work any gate; staff only events they're assigned to. */
  async function assertAccess(scanner: Scanner, eventId: string) {
    const event = await repo.findGateEvent(eventId);
    if (!event) throw AppError.notFound('Event not found');
    if (scanner.role !== 'admin' && !(await repo.isAssigned(eventId, scanner.id))) {
      throw AppError.forbidden('You are not on the staff list for this event');
    }
    return event;
  }

  async function recent(eventId: string): Promise<ScanLogEntry[]> {
    return (await repo.recentScans(eventId)).map((r) => ({
      id: r.id,
      result: r.result,
      ticketCode: r.ticketCode,
      holderName: fullName(r.holderFirstName, r.holderLastName),
      staffName: fullName(r.staffFirstName, r.staffLastName) ?? 'Unknown',
      gate: r.gate,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  return {
    assertAccess,

    async listEvents(scanner: Scanner): Promise<GateEvent[]> {
      const rows = await repo.listGateEvents(scanner.role === 'admin' ? null : scanner.id);
      return rows.map((e) => ({ ...toSummary(e), checkedIn: e.checkedIn }));
    },

    async overview(scanner: Scanner, eventId: string) {
      const event = await assertAccess(scanner, eventId);
      return {
        event: { ...toSummary(event), checkedIn: event.checkedIn } satisfies GateEvent,
        stats: await repo.stats(eventId),
        recent: await recent(eventId),
      };
    },

    /**
     * One scan, start to finish. Every attempt is logged, and every outcome is a
     * normal response: an invalid ticket is an answer for the gate, not an error.
     */
    async scan(scanner: Scanner, eventId: string, input: ScanInput): Promise<ScanResult> {
      const event = await assertAccess(scanner, eventId);
      const gate = input.gate || null;

      // Which ticket is this? A forged or edited QR fails the signature check here.
      const ticketId = input.payload
        ? signer.verify(input.payload)
        : ((await repo.findTicketByCode(input.code!))?.id ?? null);
      let ticket = ticketId ? await repo.findTicketById(ticketId) : undefined;

      let result: ScanResultKind;
      let message: string;
      const opensAt = new Date(event.startsAt.getTime() - DOORS_OPEN_HOURS * 60 * 60 * 1000);
      const now = new Date();

      if (!ticket) {
        result = 'invalid';
        message = 'Not a valid Monthati ticket';
      } else if (now < opensAt || now > event.endsAt || event.status !== 'published') {
        result = 'not_open';
        message =
          event.status === 'cancelled'
            ? 'This event was cancelled'
            : now < opensAt
              ? `Gates open ${formatDay(opensAt.toISOString())} at ${formatTime(opensAt.toISOString())}`
              : 'This event has ended';
      } else if (ticket.eventId !== eventId) {
        const other = await repo.findGateEvent(ticket.eventId);
        result = 'wrong_event';
        message = `This ticket is for ${other?.title ?? 'another event'}`;
      } else if (ticket.status === 'cancelled') {
        result = 'cancelled';
        message = 'This ticket was cancelled';
      } else if (await repo.checkIn(ticket.id, eventId, scanner.id, gate)) {
        result = 'admitted';
        message = 'Admit';
        ticket = await repo.findTicketById(ticket.id);
      } else {
        // Someone (maybe another gate, a moment ago) already admitted this ticket.
        ticket = await repo.findTicketById(ticket.id);
        result = 'already_used';
        const at = ticket?.checkedInAt ? formatTime(ticket.checkedInAt.toISOString()) : '';
        const by =
          ticket?.checkedInGate ??
          fullName(ticket?.checkerFirstName ?? null, ticket?.checkerLastName ?? null);
        message = `Already scanned at ${at}${by ? ` by ${by}` : ''}`;
      }

      const logId = await repo.log({
        eventId,
        ticketId: ticket?.id ?? null,
        staffId: scanner.id,
        result,
        gate,
      });
      const stats = await repo.stats(eventId);

      const [entry] = (await recent(eventId)).filter((s) => s.id === logId);
      if (entry) bus.publish(liveChannel(eventId), { stats, scan: entry } satisfies LiveGateUpdate);

      return {
        result,
        message,
        stats,
        ticket: ticket
          ? {
              code: ticket.code,
              holderName: fullName(ticket.holderFirstName, ticket.holderLastName)!,
              holderAvatarUrl: ticket.holderAvatarUrl,
              checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
              checkedInBy: fullName(ticket.checkerFirstName, ticket.checkerLastName),
              gate: ticket.checkedInGate,
            }
          : null,
      };
    },

    // ── Staff assignment (admin) ──

    async listStaff(): Promise<StaffMember[]> {
      return (await repo.listStaffUsers()) as StaffMember[];
    },

    async assignedStaff(eventId: string): Promise<StaffMember[]> {
      if (!(await repo.findGateEvent(eventId))) throw AppError.notFound('Event not found');
      return (await repo.assignedStaff(eventId)) as StaffMember[];
    },

    async assignStaff(eventId: string, userIds: string[]): Promise<StaffMember[]> {
      if (!(await repo.findGateEvent(eventId))) throw AppError.notFound('Event not found');
      const unique = [...new Set(userIds)];
      if ((await repo.countStaff(unique)) !== unique.length) {
        throw AppError.badRequest('Only gate staff accounts can be assigned', {
          userIds: ['Only gate staff accounts can be assigned'],
        });
      }
      await db.transaction((tx) => gateRepository(tx).replaceAssignments(eventId, unique));
      return (await repo.assignedStaff(eventId)) as StaffMember[];
    },
  };
}

export type GateService = ReturnType<typeof gateService>;
