import {
  formatCents,
  type LedgerEntry,
  type LedgerKind,
  type TopUpInput,
  type Wallet,
  type WithdrawInput,
} from '@spu-events/shared';
import type { Db } from '../../db/client';
import { uniqueViolation } from '../../lib/db-errors';
import { AppError } from '../../lib/errors';
import { PaymentDeclinedError, type PaymentProvider } from '../../lib/payments';
import { walletRepository, type WalletRepository } from './wallet.repository';

function describe(kind: LedgerKind, eventTitle: string | null, note: string | null) {
  switch (kind) {
    case 'top_up':
      return 'Top-up';
    case 'withdrawal':
      return 'Withdrawal';
    case 'ticket_purchase':
      return `Ticket: ${eventTitle ?? 'event'}`;
    case 'ticket_refund':
      return `Refund: ${eventTitle ?? 'event'}`;
    case 'adjustment':
      return note ?? 'Adjustment';
  }
}

/** Ledger rows as the wallet screens show them. */
export function toLedgerEntries(rows: Awaited<ReturnType<WalletRepository['history']>>) {
  return rows.map((r): LedgerEntry => ({
    id: r.id,
    amountCents: r.amountCents,
    kind: r.kind,
    description: describe(r.kind, r.eventTitle, r.note),
    balanceAfterCents: r.balanceAfterCents,
    createdAt: r.createdAt.toISOString(),
  }));
}

export const insufficientFunds = (balanceCents: number, neededCents: number) =>
  new AppError(
    409,
    'INSUFFICIENT_FUNDS',
    `Your balance is ${formatCents(balanceCents)}. You need ${formatCents(neededCents)}.`,
  );

export function walletService({ db, payments }: { db: Db; payments: PaymentProvider }) {
  const repo = walletRepository(db);

  async function get(userId: string): Promise<Wallet> {
    const [balanceCents, rows] = await Promise.all([repo.balance(userId), repo.history(userId)]);
    return { balanceCents, entries: toLedgerEntries(rows) };
  }

  return {
    get,

    /**
     * Charges the card, then credits the wallet. The provider receives requestId as
     * its idempotency key, and the ledger's unique (user, requestId) index means a
     * repeated request returns the wallet unchanged instead of crediting twice.
     */
    async topUp(userId: string, { amountCents, requestId }: TopUpInput) {
      if (await repo.findByRequest(userId, requestId)) return get(userId);

      let providerRef: string;
      try {
        providerRef = await payments.charge({ userId, amountCents, requestId });
      } catch (err) {
        if (err instanceof PaymentDeclinedError) {
          throw new AppError(402, 'PAYMENT_DECLINED', err.message);
        }
        throw err;
      }

      try {
        await repo.insert({ userId, amountCents, kind: 'top_up', requestId, providerRef });
      } catch (err) {
        if (uniqueViolation(err) === null) throw err;
        // A concurrent duplicate got there first; the provider deduplicated the charge.
      }
      return get(userId);
    },

    /**
     * Debits the wallet under a row lock, then pays out. If the payout fails the
     * debit is reversed with a compensating entry: money is never lost, and the
     * history shows exactly what happened.
     */
    async withdraw(userId: string, { amountCents, requestId }: WithdrawInput) {
      if (await repo.findByRequest(userId, requestId)) return get(userId);

      try {
        await db.transaction(async (tx) => {
          const wallet = walletRepository(tx);
          await wallet.lockUser(userId);
          const balance = await wallet.balance(userId);
          if (balance < amountCents) throw insufficientFunds(balance, amountCents);
          await wallet.insert({
            userId,
            amountCents: -amountCents,
            kind: 'withdrawal',
            requestId,
          });
        });
      } catch (err) {
        if (uniqueViolation(err) !== null) return get(userId);
        throw err;
      }

      try {
        await payments.payout({ userId, amountCents, requestId });
      } catch (err) {
        await repo.insert({
          userId,
          amountCents,
          kind: 'adjustment',
          note: 'Withdrawal reversed: payout failed',
        });
        if (err instanceof PaymentDeclinedError) {
          throw new AppError(
            502,
            'PAYOUT_FAILED',
            'The bank payout failed, so your balance was restored',
          );
        }
        throw err;
      }
      return get(userId);
    },
  };
}

export type WalletService = ReturnType<typeof walletService>;
