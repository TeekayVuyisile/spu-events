/**
 * Money is always stored and transported as integer cents (ZAR) to avoid
 * floating-point drift. Convert to rands only for display.
 */
export type Cents = number;

const zar = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });

export function formatCents(cents: Cents): string {
  return zar.format(cents / 100);
}

export function randsToCents(rands: number): Cents {
  return Math.round(rands * 100);
}
