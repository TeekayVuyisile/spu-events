/**
 * Every event happens on campus, so times are entered and shown in campus time
 * (SAST, UTC+2, no daylight saving) whatever the viewer's device is set to.
 * The database and API carry UTC ISO strings.
 */
export const CAMPUS_TZ = 'Africa/Johannesburg';
const CAMPUS_OFFSET = '+02:00';

/** `2026-10-24T19:00` (a datetime-local value, campus time) → UTC ISO string. */
export function campusInputToIso(local: string): string {
  return new Date(`${local}:00${CAMPUS_OFFSET}`).toISOString();
}

/** UTC ISO string → `2026-10-24T19:00` in campus time, for a datetime-local input. */
export function isoToCampusInput(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 2 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-ZA', { timeZone: CAMPUS_TZ, ...options });

const dayFmt = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });
const monthFmt = fmt({ month: 'short' });
const dateNumFmt = fmt({ day: 'numeric' });
const longFmt = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** "Fri 24 Oct" (built from parts: en-ZA would otherwise add a comma after the weekday). */
export function formatDay(iso: string) {
  const parts = Object.fromEntries(
    dayFmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month}`;
}
/** "19:00" */
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
/** "Friday 24 October 2026" */
export const formatLongDate = (iso: string) => longFmt.format(new Date(iso));
/** { month: "Oct", day: "24" } for calendar-style date blocks. */
export const dateBlock = (iso: string) => ({
  month: monthFmt.format(new Date(iso)),
  day: dateNumFmt.format(new Date(iso)),
});

/** "Fri 24 Oct · 19:00–23:00", or with the end day when it runs past midnight's date. */
export function formatEventWhen(startsAt: string, endsAt: string): string {
  const sameDay = formatDay(startsAt) === formatDay(endsAt);
  return sameDay
    ? `${formatDay(startsAt)} · ${formatTime(startsAt)}–${formatTime(endsAt)}`
    : `${formatDay(startsAt)} ${formatTime(startsAt)} – ${formatDay(endsAt)} ${formatTime(endsAt)}`;
}
