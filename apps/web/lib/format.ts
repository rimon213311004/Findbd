import type { ReportSummary } from '@findbd/shared';

/**
 * Formatting helpers.
 *
 * `publicPlace` is the one that matters. Reports carry a `locationDescription`
 * that names the exact spot — "chained outside the Sector 7 kitchen market" — and
 * the API withholds it from everyone but the owner. This function is what the rest
 * of the client uses instead, and it can only ever produce area + district. A
 * component that wants a location has no way to reach for the private field by
 * accident, because it never has it.
 */

export function publicPlace(report: Pick<ReportSummary, 'area' | 'district'>): string {
  return `${report.area}, ${report.district}`;
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DATE_FORMAT.format(date);
}

/** "12 Aug 2026 · 09:30", or just the date when no time was given. */
export function formatWhen(iso: string, approxTime: string): string {
  const date = formatDate(iso);
  return approxTime ? `${date} · ${approxTime}` : date;
}

/** "2 hours ago". Falls back to a date past a week, where "9 days ago" stops helping. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  if (days <= 7) return `${days} day${days === 1 ? '' : 's'} ago`;

  return formatDate(iso);
}

/** Today, as the `YYYY-MM-DD` an `<input type="date">` expects. */
export function todayInputValue(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** `2026-08-12T00:00:00.000Z` → `2026-08-12`, for editing a stored date. */
export function toInputDate(iso: string): string {
  return iso.slice(0, 10);
}

export function pluralise(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
