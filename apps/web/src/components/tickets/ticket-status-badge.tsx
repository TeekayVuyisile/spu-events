import type { Ticket } from '@spu-events/shared';
import { Ban, CircleCheck, ScanLine } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/** Icon + label, never colour alone. */
export function TicketStatusBadge({ ticket }: { ticket: Pick<Ticket, 'status' | 'cancelReason'> }) {
  if (ticket.status === 'used') {
    return (
      <Badge>
        <ScanLine aria-hidden /> Checked in
      </Badge>
    );
  }
  if (ticket.status === 'cancelled') {
    return (
      <Badge tone="destructive">
        <Ban aria-hidden />{' '}
        {ticket.cancelReason === 'event_cancelled' ? 'Event cancelled' : 'Cancelled'}
      </Badge>
    );
  }
  return (
    <Badge tone="success">
      <CircleCheck aria-hidden /> Valid
    </Badge>
  );
}
