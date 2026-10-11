import { describe, expect, it } from 'vitest';
import { eventInputSchema, eventListQuerySchema } from './events';
import { campusInputToIso, formatEventWhen, isoToCampusInput } from './time';

const valid = {
  title: 'Spring Formal',
  category: 'party',
  venue: 'Great Hall',
  startsAt: '2026-10-24T17:00:00.000Z',
  endsAt: '2026-10-24T21:00:00.000Z',
  capacity: 300,
  priceCents: 15000,
};

describe('eventInputSchema', () => {
  it('fills defaults', () => {
    expect(eventInputSchema.parse(valid)).toMatchObject({
      description: '',
      volunteersWanted: false,
    });
  });

  it('rejects an end before the start, on the end field', () => {
    const result = eventInputSchema.safeParse({ ...valid, endsAt: valid.startsAt });
    expect(result.error?.issues[0]?.path).toEqual(['endsAt']);
  });

  it('only takes whole cents', () => {
    expect(eventInputSchema.safeParse({ ...valid, priceCents: 150.5 }).success).toBe(false);
  });
});

describe('eventListQuerySchema', () => {
  it('falls back to defaults on junk instead of failing', () => {
    expect(eventListQuerySchema.parse({ when: 'someday', category: 'nope', page: '-3' })).toEqual({
      when: 'upcoming',
      page: 1,
    });
  });
});

describe('campus time', () => {
  it('treats input as SAST regardless of the device time zone', () => {
    expect(campusInputToIso('2026-10-24T19:00')).toBe('2026-10-24T17:00:00.000Z');
    expect(isoToCampusInput('2026-10-24T17:00:00.000Z')).toBe('2026-10-24T19:00');
  });

  it('formats a same-day event compactly', () => {
    expect(formatEventWhen(valid.startsAt, valid.endsAt)).toBe('Sat 24 Oct · 19:00–23:00');
  });
});
