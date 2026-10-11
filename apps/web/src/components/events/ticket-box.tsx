import { formatCents, type EventDetail } from '@monthati/shared';
import { useQuery } from '@tanstack/react-query';
import { Ticket, Users, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { FormAlert } from '@/components/ui/form-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/auth';
import { formatPrice, hasEnded } from '@/lib/events';
import { usePurchase } from '@/lib/tickets';
import { cn } from '@/lib/utils';
import { walletQuery } from '@/lib/wallet';

/** "Only 4 left" urgency kicks in at this many spots or fewer. */
const LOW_STOCK = 10;

/**
 * The event page's ticket stub: price, spots left and the one CTA, which
 * changes with who's looking and the event's state.
 */
export function TicketBox({ event }: { event: EventDetail }) {
  const { user } = useSession();
  const [confirming, setConfirming] = useState(false);
  const spotsLeft = Math.max(0, event.capacity - event.ticketsSold);
  const cancelled = event.status === 'cancelled';
  const ended = hasEnded(event);
  const onSale = !cancelled && !ended;

  let action: React.ReactNode;
  if (event.myTicketId) {
    action = (
      <Button asChild size="lg" className="w-full">
        <Link to={`/tickets/${event.myTicketId}`}>
          <Ticket aria-hidden /> View your ticket
        </Link>
      </Button>
    );
  } else if (!onSale) {
    action = (
      <Button size="lg" className="w-full" disabled>
        {cancelled ? 'Cancelled' : 'Event ended'}
      </Button>
    );
  } else if (spotsLeft === 0) {
    action = (
      <Button size="lg" className="w-full" disabled>
        Sold out
      </Button>
    );
  } else if (!user) {
    action = (
      <Button asChild variant="cta" size="lg" className="w-full">
        <Link to={`/login?next=${encodeURIComponent(`/events/${event.slug}`)}`}>
          Log in to get a ticket
        </Link>
      </Button>
    );
  } else if (user.role !== 'student') {
    action = (
      <Button size="lg" className="w-full" disabled>
        Tickets are for students
      </Button>
    );
  } else {
    action = (
      <Button variant="cta" size="lg" className="w-full" onClick={() => setConfirming(true)}>
        {event.priceCents ? (
          <>
            Get ticket · <span className="tabular">{formatCents(event.priceCents)}</span>
          </>
        ) : (
          'Get free ticket'
        )}
      </Button>
    );
  }

  return (
    <aside className="ticket-notch rounded-xl border bg-card [--notch-y:96px] lg:sticky lg:top-24">
      <div className="space-y-1 p-5">
        <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Admission
        </p>
        <p className="tabular text-3xl font-bold">{formatPrice(event.priceCents)}</p>
      </div>
      <div className="perforation mx-5" />
      <div className="space-y-4 p-5">
        {onSale && (
          <p
            className={cn(
              'flex items-center gap-2 text-sm',
              spotsLeft > 0 && spotsLeft <= LOW_STOCK
                ? 'font-semibold text-warning'
                : 'text-muted-foreground',
            )}
          >
            <Users className="size-4" aria-hidden />
            {spotsLeft === 0 ? (
              'No spots left'
            ) : spotsLeft <= LOW_STOCK ? (
              <span>
                Only <span className="tabular">{spotsLeft}</span> left
              </span>
            ) : (
              <span>
                <span className="tabular">{spotsLeft.toLocaleString('en-ZA')}</span> of{' '}
                <span className="tabular">{event.capacity.toLocaleString('en-ZA')}</span> spots left
              </span>
            )}
          </p>
        )}
        {action}
      </div>

      {confirming && <ConfirmDialog event={event} onClose={() => setConfirming(false)} />}
    </aside>
  );
}

function ConfirmDialog({ event, onClose }: { event: EventDetail; onClose: () => void }) {
  const navigate = useNavigate();
  const purchase = usePurchase(event.id);
  const paid = event.priceCents > 0;
  const wallet = useQuery({ ...walletQuery, enabled: paid });
  const balance = wallet.data?.balanceCents;
  const short = paid && balance !== undefined && balance < event.priceCents;

  const buy = () =>
    purchase.mutate(undefined, {
      onSuccess: ({ ticket }) => navigate(`/tickets/${ticket.id}`, { state: { justIssued: true } }),
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={paid ? 'Confirm your ticket' : 'Get your free ticket'}
        description={event.title}
      >
        {paid && (
          <dl className="tabular space-y-2 rounded-lg bg-muted p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Wallet balance</dt>
              <dd>
                {balance === undefined ? <Skeleton className="h-4 w-16" /> : formatCents(balance)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Ticket</dt>
              <dd>−{formatCents(event.priceCents)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <dt>After</dt>
              <dd className={cn(short && 'text-destructive')}>
                {balance === undefined ? '…' : formatCents(balance - event.priceCents)}
              </dd>
            </div>
          </dl>
        )}

        <FormAlert message={purchase.error?.message} />

        {short ? (
          <div className="space-y-3">
            <p className="text-sm">You need {formatCents(event.priceCents - balance!)} more.</p>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">Not now</Button>
              </DialogClose>
              <Button asChild variant="cta">
                <Link to="/wallet">
                  <Wallet aria-hidden /> Top up
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="cta"
              loading={purchase.isPending}
              disabled={paid && balance === undefined}
              onClick={buy}
            >
              {paid ? `Pay ${formatCents(event.priceCents)}` : 'Get ticket'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
