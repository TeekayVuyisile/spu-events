import type { EventSummary } from './events';

export const TICKET_STATUSES = ['valid', 'used', 'cancelled'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const CANCEL_REASONS = ['by_holder', 'event_cancelled'] as const;
export type TicketCancelReason = (typeof CANCEL_REASONS)[number];

/** Paid tickets can be cancelled for a refund until this long before the start. */
export const REFUND_CUTOFF_HOURS = 24;

/**
 * When a ticket can still be cancelled by its holder: paid tickets until
 * REFUND_CUTOFF_HOURS before the start (they're refunded), free ones until the start.
 */
export function cancelDeadline(ticket: { pricePaidCents: number }, event: { startsAt: string }) {
  const start = new Date(event.startsAt).getTime();
  return new Date(ticket.pricePaidCents > 0 ? start - REFUND_CUTOFF_HOURS * 60 * 60 * 1000 : start);
}

export interface Ticket {
  id: string;
  /** Short human-readable code for manual entry at the gate: MTH-7Q4K-29XD. */
  code: string;
  status: TicketStatus;
  pricePaidCents: number;
  cancelReason: TicketCancelReason | null;
  cancelledAt: string | null;
  createdAt: string;
  event: EventSummary;
}

/** The holder's own view, with the signed QR payload. */
export interface TicketDetail extends Ticket {
  /** Signed payload for the QR code; null once the ticket is used or cancelled. */
  qrPayload: string | null;
}

export const TICKET_SCOPES = ['upcoming', 'past'] as const;
export type TicketScope = (typeof TICKET_SCOPES)[number];
