import { randomBytes } from 'node:crypto';

/**
 * Moves real money in and out of wallets. A real gateway (PayFast, Yoco…) would
 * implement this; until then the simulated one approves everything.
 */
export interface PaymentProvider {
  /** Charge the student's card and return the provider's reference. Throws if declined. */
  charge(input: { userId: string; amountCents: number; requestId: string }): Promise<string>;
  /** Pay out to the student's bank account and return the provider's reference. */
  payout(input: { userId: string; amountCents: number; requestId: string }): Promise<string>;
}

export class PaymentDeclinedError extends Error {
  constructor(message = 'The payment was declined') {
    super(message);
    this.name = 'PaymentDeclinedError';
  }
}

export function simulatedPayments(): PaymentProvider {
  const ref = (prefix: string) => `${prefix}_sim_${randomBytes(6).toString('hex')}`;
  return {
    charge: async () => ref('ch'),
    payout: async () => ref('po'),
  };
}
