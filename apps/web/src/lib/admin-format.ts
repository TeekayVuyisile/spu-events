import { CAMPUS_TZ } from '@spu-events/shared';

const dayMonth = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  timeZone: CAMPUS_TZ,
});

/** "2026-10-11" (a campus-time date) → "11 Oct". Noon avoids any edge-of-day shift. */
export const shortDate = (date: string) => dayMonth.format(new Date(`${date}T12:00:00+02:00`));

const dateTime = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: CAMPUS_TZ,
});

/** "11 Oct 2026, 14:05" in campus time. */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

/**
 * Change against the previous period: a percentage for counts and money,
 * percentage points for rates. Null when there's nothing to compare with.
 */
export function delta(
  value: number | null,
  previous: number | null,
  kind: 'count' | 'rate',
): { up: boolean; label: string } | null {
  if (value === null || previous === null) return null;
  if (kind === 'rate') {
    const pts = Math.round((value - previous) * 100);
    return pts === 0 ? null : { up: pts > 0, label: `${Math.abs(pts)} pts` };
  }
  if (previous === 0) return value > 0 ? { up: true, label: 'New' } : null;
  const pct = Math.round(((value - previous) / previous) * 100);
  return pct === 0 ? null : { up: pct > 0, label: `${Math.abs(pct)}%` };
}
