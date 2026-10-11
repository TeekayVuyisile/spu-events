import { cancelDeadline, type Ticket, type TicketDetail, type TicketScope } from '@monthati/shared';
import type { Db, Executor } from '../../db/client';
import type { TicketRow } from '../../db/schema';
import { uniqueViolation } from '../../lib/db-errors';
import { AppError } from '../../lib/errors';
import type { StorageService } from '../../lib/storage';
import { generateTicketCode, type TicketSigner } from '../../lib/ticket-signing';
import { eventsRepository } from '../events/events.repository';
import { eventMappers, type EventWithSold } from '../events/events.mappers';
import { insufficientFunds } from '../wallet/wallet.service';
import { walletRepository } from '../wallet/wallet.repository';
import { ticketsRepository } from './tickets.repository';

const notFound = () => AppError.notFound('Ticket not found');

/**
 * Credits refunds for tickets that were just cancelled. Credits never need the
 * user lock: only debits can overdraw a wallet.
 */
export async function refundTickets(tx: Executor, cancelled: TicketRow[]) {
  const wallet = walletRepository(tx);
  for (const t of cancelled) {
    if (t.pricePaidCents > 0) {
      await wallet.insert({
        userId: t.userId,
        amountCents: t.pricePaidCents,
        kind: 'ticket_refund',
        ticketId: t.id,
      });
    }
  }
}

export function ticketsService({
  db,
  storage,
  signer,
}: {
  db: Db;
  storage: StorageService;
  signer: TicketSigner;
}) {
  const repo = ticketsRepository(db);
  const { toSummary } = eventMappers(storage);

  const toTicket = (t: TicketRow, e: EventWithSold): Ticket => ({
    id: t.id,
    code: t.code,
    status: t.status,
    pricePaidCents: t.pricePaidCents,
    cancelReason: t.cancelReason,
    cancelledAt: t.cancelledAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    event: toSummary(e),
  });

  const toDetail = (t: TicketRow, e: EventWithSold): TicketDetail => ({
    ...toTicket(t, e),
    // Only a valid ticket gets a scannable code.
    qrPayload: t.status === 'valid' ? signer.payload(t.id) : null,
  });

  async function getMine(userId: string, id: string): Promise<TicketDetail> {
    const found = await repo.findForUser(id, userId);
    if (!found) throw notFound();
    return toDetail(found.ticket, found.event);
  }

  return {
    getMine,

    /**
     * One-step purchase. Lock order is always event → user (the same as every
     * other path), so concurrent purchases and cancellations queue instead of deadlocking.
     *
     * 1. Lock the event row: capacity can't change under us.
     * 2. Check it's on sale, the student has no ticket yet, and a spot is left.
     * 3. For paid events, lock the user and check the balance.
     * 4. Insert the ticket and the matching ledger debit, then commit together.
     */
    async purchase(userId: string, eventId: string): Promise<TicketDetail> {
      const ticket = await db.transaction(async (tx) => {
        const event = await eventsRepository(tx).lock(eventId);
        if (!event || event.status === 'draft') throw AppError.notFound('Event not found');
        if (event.status === 'cancelled') {
          throw new AppError(409, 'EVENT_CANCELLED', 'This event has been cancelled');
        }
        if (event.endsAt <= new Date()) {
          throw new AppError(409, 'EVENT_ENDED', 'This event has already ended');
        }

        const tickets = ticketsRepository(tx);
        const existing = await tickets.findActive(eventId, userId);
        if (existing) {
          throw new AppError(409, 'ALREADY_HAS_TICKET', 'You already have a ticket for this event');
        }
        if (event.ticketsSold >= event.capacity) {
          throw new AppError(409, 'SOLD_OUT', 'Sorry, this event is sold out');
        }

        if (event.priceCents > 0) {
          const wallet = walletRepository(tx);
          await wallet.lockUser(userId);
          const balance = await wallet.balance(userId);
          if (balance < event.priceCents) throw insufficientFunds(balance, event.priceCents);
        }

        // Codes have 32^8 combinations; retry inside a savepoint on the rare clash.
        let row: TicketRow | undefined;
        for (let attempt = 0; !row; attempt++) {
          try {
            row = await tx.transaction((sp) =>
              ticketsRepository(sp).insert({
                code: generateTicketCode(),
                eventId,
                userId,
                pricePaidCents: event.priceCents,
              }),
            );
          } catch (err) {
            if (!uniqueViolation(err)?.includes('code') || attempt >= 3) throw err;
          }
        }

        if (event.priceCents > 0) {
          await walletRepository(tx).insert({
            userId,
            amountCents: -event.priceCents,
            kind: 'ticket_purchase',
            ticketId: row.id,
          });
        }
        return row;
      });

      return getMine(userId, ticket.id);
    },

    async listMine(userId: string, scope: TicketScope): Promise<Ticket[]> {
      return (await repo.listForUser(userId, scope)).map((r) => toTicket(r.ticket, r.event));
    },

    /** The holder gives a ticket back; paid tickets are refunded to the wallet. */
    async cancelMine(userId: string, id: string): Promise<TicketDetail> {
      const found = await repo.findForUser(id, userId);
      if (!found) throw notFound();

      await db.transaction(async (tx) => {
        // Same lock order as purchase: event first.
        const event = await eventsRepository(tx).lock(found.event.id);
        if (found.ticket.status !== 'valid') {
          throw AppError.conflict(
            found.ticket.status === 'used'
              ? 'This ticket has already been used'
              : 'This ticket is already cancelled',
          );
        }
        const deadline = cancelDeadline(found.ticket, { startsAt: event!.startsAt.toISOString() });
        if (new Date() > deadline) {
          throw new AppError(
            409,
            'CANCEL_CLOSED',
            found.ticket.pricePaidCents > 0
              ? 'Paid tickets can only be cancelled up to 24 hours before the event'
              : 'This event has already started',
          );
        }

        const cancelled = await ticketsRepository(tx).cancel(id, 'by_holder');
        if (!cancelled) throw AppError.conflict('This ticket can’t be cancelled any more');
        await refundTickets(tx, [cancelled]);
      });

      return getMine(userId, id);
    },
  };
}

export type TicketsService = ReturnType<typeof ticketsService>;
