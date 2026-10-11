import { z } from 'zod';

export const LEDGER_KINDS = [
  'top_up',
  'withdrawal',
  'ticket_purchase',
  'ticket_refund',
  'adjustment',
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const TOP_UP_MIN_CENTS = 1_000; // R10
export const TOP_UP_MAX_CENTS = 200_000; // R2 000
export const WITHDRAW_MIN_CENTS = 1_000; // R10

/**
 * `requestId` is generated once per form submission, so a double-click or a
 * retried request can never move money twice.
 */
export const topUpSchema = z.object({
  amountCents: z
    .number('Enter an amount')
    .int()
    .min(TOP_UP_MIN_CENTS, 'Top up at least R10')
    .max(TOP_UP_MAX_CENTS, 'Top up at most R2 000 at a time'),
  requestId: z.uuid(),
});
export type TopUpInput = z.infer<typeof topUpSchema>;

export const withdrawSchema = z.object({
  amountCents: z.number('Enter an amount').int().min(WITHDRAW_MIN_CENTS, 'Withdraw at least R10'),
  requestId: z.uuid(),
});
export type WithdrawInput = z.infer<typeof withdrawSchema>;

export interface LedgerEntry {
  id: string;
  /** Positive is money in, negative is money out. */
  amountCents: number;
  kind: LedgerKind;
  description: string;
  /** Balance straight after this entry. */
  balanceAfterCents: number;
  createdAt: string;
}

export interface Wallet {
  balanceCents: number;
  entries: LedgerEntry[];
}
