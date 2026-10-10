import { describe, expect, it } from 'vitest';
import { formatCents, randsToCents } from './money';

describe('money', () => {
  it('converts rands to integer cents without float drift', () => {
    expect(randsToCents(0.1 + 0.2)).toBe(30);
    expect(randsToCents(150)).toBe(15000);
  });

  it('formats cents as ZAR', () => {
    expect(formatCents(15000)).toMatch(/R\s?150[,.]00/);
  });
});
