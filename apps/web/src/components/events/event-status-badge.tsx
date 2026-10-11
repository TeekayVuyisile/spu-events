import type { EventSummary } from '@spu-events/shared';
import { Ban, CircleCheck, Flag, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { hasEnded } from '@/lib/events';

/** Admin-facing status, including the derived "Ended". Always icon + label. */
export function EventStatusBadge({ event }: { event: Pick<EventSummary, 'status' | 'endsAt'> }) {
  if (event.status === 'draft') {
    return (
      <Badge>
        <Pencil aria-hidden /> Draft
      </Badge>
    );
  }
  if (event.status === 'cancelled') {
    return (
      <Badge tone="destructive">
        <Ban aria-hidden /> Cancelled
      </Badge>
    );
  }
  if (hasEnded(event)) {
    return (
      <Badge>
        <Flag aria-hidden /> Ended
      </Badge>
    );
  }
  return (
    <Badge tone="success">
      <CircleCheck aria-hidden /> Published
    </Badge>
  );
}
