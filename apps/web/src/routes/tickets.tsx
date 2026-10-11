import { dateBlock, formatEventWhen, TICKET_SCOPES, type TicketScope } from '@monthati/shared';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Ticket as TicketIcon } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { TicketStatusBadge } from '@/components/tickets/ticket-status-badge';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ticketsQuery } from '@/lib/tickets';
import { cn } from '@/lib/utils';

const LABELS: Record<TicketScope, string> = { upcoming: 'Upcoming', past: 'Past' };

export function TicketsPage() {
  const [params, setParams] = useSearchParams();
  const scope: TicketScope = params.get('scope') === 'past' ? 'past' : 'upcoming';
  const tickets = useQuery(ticketsQuery(scope));

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-extrabold md:text-4xl">My tickets</h1>

      <div role="group" aria-label="Show" className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {TICKET_SCOPES.map((s) => (
          <button
            key={s}
            aria-pressed={scope === s}
            onClick={() => setParams(s === 'upcoming' ? {} : { scope: s }, { replace: true })}
            className={cn(
              'h-10 cursor-pointer rounded-md px-4 text-sm font-medium transition-colors',
              scope === s
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {LABELS[s]}
          </button>
        ))}
      </div>

      {tickets.isPending ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : tickets.isError ? (
        <FormAlert message={tickets.error.message} />
      ) : tickets.data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
          <TicketIcon className="size-10 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          <p className="font-display text-lg font-semibold">
            {scope === 'upcoming' ? 'No upcoming tickets' : 'Nothing here yet'}
          </p>
          {scope === 'upcoming' && (
            <Button asChild>
              <Link to="/">Find an event</Link>
            </Button>
          )}
        </div>
      ) : (
        <Stagger key={scope} className="space-y-3">
          {tickets.data.map((ticket) => {
            const { month, day } = dateBlock(ticket.event.startsAt);
            return (
              <StaggerItem key={ticket.id}>
                <Link
                  to={`/tickets/${ticket.id}`}
                  className={cn(
                    'ticket-notch flex items-stretch overflow-hidden rounded-xl border bg-card transition-colors [--notch-y:50%] hover:border-primary/40',
                    ticket.status === 'cancelled' && 'opacity-70',
                  )}
                >
                  <div className="flex w-20 shrink-0 flex-col items-center justify-center bg-primary/10 text-primary">
                    <span className="text-xs font-semibold uppercase">{month}</span>
                    <span className="tabular text-2xl font-bold">{day}</span>
                  </div>
                  {/* Vertical perforation between the stub and the body. */}
                  <div
                    aria-hidden
                    className="w-0.5 shrink-0 bg-[repeating-linear-gradient(180deg,var(--border)_0_8px,transparent_8px_14px)]"
                  />
                  <div className="min-w-0 flex-1 space-y-1.5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="truncate font-semibold">{ticket.event.title}</p>
                      <TicketStatusBadge ticket={ticket} />
                    </div>
                    <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                      <MapPin className="size-4 shrink-0" aria-hidden />
                      {ticket.event.venue}
                    </p>
                    <p className="tabular text-sm text-muted-foreground">
                      {formatEventWhen(ticket.event.startsAt, ticket.event.endsAt)} · {ticket.code}
                    </p>
                  </div>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </div>
  );
}
