import {
  cancelDeadline,
  formatCents,
  formatEventWhen,
  formatLongDate,
  formatTime,
  formatDay,
  type TicketDetail,
} from '@monthati/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CloudOff, Maximize2, PartyPopper, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { toast } from 'sonner';
import { EventCover } from '@/components/events/event-cover';
import { TicketDivider } from '@/components/tickets/ticket-divider';
import { TicketQr } from '@/components/tickets/ticket-qr';
import { TicketStatusBadge } from '@/components/tickets/ticket-status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api';
import { duration, spring } from '@/lib/motion';
import { ticketQuery, useCancelTicket } from '@/lib/tickets';
import { NotFoundPage } from '@/routes/not-found';

export function TicketPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const justIssued = (location.state as { justIssued?: boolean } | null)?.justIssued === true;
  const query = useQuery(ticketQuery(id));
  const [gate, setGate] = useState(false);

  if (query.isPending) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-[34rem] w-full rounded-xl" />
      </div>
    );
  }
  if (!query.data) {
    if (query.error instanceof ApiRequestError && query.error.status === 404)
      return <NotFoundPage />;
    throw query.error;
  }

  const ticket = query.data;
  // Refetch failed but we have a copy: almost always "no signal at the gate".
  const offline = query.isError;

  return (
    <div className="mx-auto max-w-md space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link to="/tickets">
          <ArrowLeft aria-hidden /> My tickets
        </Link>
      </Button>

      {justIssued && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 font-display text-2xl font-extrabold"
        >
          <PartyPopper className="size-7 text-cta" aria-hidden /> You’re in!
        </motion.p>
      )}

      {offline && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"
        >
          <CloudOff className="size-4" aria-hidden /> Offline copy. Your QR code still works at the
          gate.
        </p>
      )}

      <PrintedStub animate={justIssued}>
        <TicketStub ticket={ticket} printing={justIssued} />
      </PrintedStub>

      <div className="flex flex-col gap-3">
        {ticket.qrPayload && (
          <Button size="lg" className="w-full" onClick={() => setGate(true)}>
            <Maximize2 aria-hidden /> Show at the gate
          </Button>
        )}
        <CancelSection ticket={ticket} disabled={offline} />
      </div>

      <AnimatePresence>
        {gate && ticket.qrPayload && <GateView ticket={ticket} onClose={() => setGate(false)} />}
      </AnimatePresence>
    </div>
  );
}

/**
 * Signature moment 2 (MASTER.md §5): a fresh ticket "prints", sliding up out of a
 * slot. Reduced motion shows it in place.
 */
function PrintedStub({ animate, children }: { animate: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (!animate || reduce) return <>{children}</>;
  return (
    <div className="relative overflow-hidden rounded-xl pt-1">
      <div
        aria-hidden
        className="absolute inset-x-6 top-0 z-10 h-1 rounded-full bg-foreground/80"
      />
      <motion.div
        initial={{ y: '-100%' }}
        animate={{ y: 0 }}
        transition={{ ...spring.snappy, delay: 0.15 }}
      >
        {children}
      </motion.div>
    </div>
  );
}

function TicketStub({ ticket, printing }: { ticket: TicketDetail; printing: boolean }) {
  const { event } = ticket;
  return (
    <article className="overflow-hidden rounded-xl border bg-card">
      <EventCover event={event} shared={false} className="aspect-video" eager />
      <div className="space-y-1.5 p-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl leading-tight font-extrabold">
            <Link to={`/events/${event.slug}`} className="hover:underline">
              {event.title}
            </Link>
          </h1>
          <TicketStatusBadge ticket={ticket} />
        </div>
        <p className="font-medium">{formatLongDate(event.startsAt)}</p>
        <p className="tabular text-sm text-muted-foreground">
          {formatEventWhen(event.startsAt, event.endsAt)} · {event.venue}
        </p>
      </div>

      {/* The perforation draws in while printing. */}
      <TicketDivider drawIn={printing} />

      <div className="flex flex-col items-center gap-3 p-5">
        {ticket.qrPayload ? (
          <motion.div
            className="w-full max-w-60"
            initial={printing ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: duration.slow, delay: 0.75 }}
          >
            <TicketQr payload={ticket.qrPayload} />
          </motion.div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {ticket.status === 'used'
              ? 'Checked in. Enjoy the event!'
              : 'This ticket is no longer valid.'}
          </p>
        )}
        <p className="tabular text-lg font-semibold tracking-wider">{ticket.code}</p>
        <p className="tabular text-xs text-muted-foreground">
          {ticket.pricePaidCents ? `Paid ${formatCents(ticket.pricePaidCents)}` : 'Free ticket'}
        </p>
      </div>
    </article>
  );
}

/** Full-screen, high-contrast QR for scanning: white, big, nothing else to tap by mistake. */
function GateView({ ticket, onClose }: { ticket: TicketDetail; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      role="dialog"
      aria-modal
      aria-label="Ticket QR code for the gate"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: duration.fast }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white p-6 text-[#1a1033]"
      onClick={onClose}
    >
      <button
        aria-label="Close"
        autoFocus
        onClick={onClose}
        className="absolute top-4 right-4 flex size-12 cursor-pointer items-center justify-center rounded-full bg-black/5"
      >
        <X className="size-6" aria-hidden />
      </button>
      <p className="text-center font-display text-xl font-bold">{ticket.event.title}</p>
      <TicketQr payload={ticket.qrPayload!} className="w-full max-w-[min(80vw,24rem)] p-0" />
      <p className="tabular text-2xl font-bold tracking-widest">{ticket.code}</p>
      <p className="text-sm opacity-60">Turn your screen brightness up. Tap anywhere to close.</p>
    </motion.div>
  );
}

function CancelSection({ ticket, disabled }: { ticket: TicketDetail; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const cancel = useCancelTicket(ticket.id);

  if (ticket.status !== 'valid') {
    return ticket.status === 'cancelled' && ticket.pricePaidCents > 0 ? (
      <p className="text-center text-sm text-muted-foreground">
        {formatCents(ticket.pricePaidCents)} was refunded to your wallet.
      </p>
    ) : null;
  }

  const deadline = cancelDeadline(ticket, ticket.event);
  if (new Date() > deadline) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        {ticket.pricePaidCents > 0
          ? `Refunds closed ${formatDay(deadline.toISOString())} at ${formatTime(deadline.toISOString())}.`
          : 'This event has started.'}
      </p>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        className="w-full text-destructive hover:bg-destructive/10"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Cancel ticket
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {ticket.pricePaidCents > 0 ? 'Full refund' : 'Free to cancel'} until{' '}
        {formatDay(deadline.toISOString())} {formatTime(deadline.toISOString())}.
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Cancel this ticket?"
          description={
            ticket.pricePaidCents > 0
              ? `${formatCents(ticket.pricePaidCents)} goes straight back to your wallet, and your spot is released.`
              : 'Your spot is released for someone else.'
          }
        >
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Keep ticket</Button>
            </DialogClose>
            <Button
              variant="destructive"
              loading={cancel.isPending}
              onClick={() =>
                cancel.mutate(undefined, {
                  onSuccess: () => {
                    setOpen(false);
                    toast.success(
                      ticket.pricePaidCents > 0
                        ? 'Ticket cancelled and refunded'
                        : 'Ticket cancelled',
                    );
                  },
                  onError: (err) => toast.error(err.message),
                })
              }
            >
              Cancel ticket
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
