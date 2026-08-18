/**
 * Wire values to the strings the design draws.
 *
 * The prototype's fixtures stored display strings — `'1,284'`, `'2m'`, `'$39'`,
 * `'—'` — because they were transcribed from a clickable HTML prototype. The
 * platform sends numbers and ISO-8601 UTC instants. These functions are the
 * whole of that difference, so screens keep rendering the same characters.
 *
 * Grouping and clock formatting are done by hand rather than through `Intl`.
 * Hermes ships a subset of `Intl` that varies by platform and build, and these
 * outputs are pinned by tests against the design; a formatter that changes with
 * the engine would make that untestable.
 */

/** The design's placeholder for a value that does not exist yet. */
export const EMPTY = '—';

function group(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** `1284` → `'1,284'`; absent → `'—'` (the Draft workflow's counters). */
export function count(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return EMPTY;
  return group(Math.trunc(value));
}

/** `39` → `'$39'`. Whole dollars, as every price in the design is. */
export function money(usd: number | null | undefined): string {
  if (typeof usd !== 'number' || !Number.isFinite(usd)) return EMPTY;
  const whole = Math.trunc(Math.abs(usd));
  const sign = usd < 0 ? '-' : '';
  return `${sign}$${group(whole)}`;
}

/**
 * How long ago, in the design's compact form: `'2m'`, `'1h'`, `'3h'`, `'4d'`.
 *
 * `now` is injectable so tests are not clock-dependent.
 */
export function relativeTime(
  iso: string | null | undefined,
  now: number = Date.now(),
): string {
  const at = parseInstant(iso);
  if (at === null) return EMPTY;

  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** The approvals screen says `'12m ago'` where activity says `'12m'`. */
export function relativeTimeAgo(
  iso: string | null | undefined,
  now: number = Date.now(),
): string {
  const relative = relativeTime(iso, now);
  if (relative === EMPTY) return EMPTY;
  return relative === 'now' ? 'just now' : `${relative} ago`;
}

/** Wall-clock time in the device's zone: `'9:12'`, `'8:00'`. */
export function clockTime(iso: string | null | undefined): string {
  const at = parseInstant(iso);
  if (at === null) return EMPTY;
  const date = new Date(at);
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getHours()}:${minutes}`;
}

/** Elapsed run time, as the run-detail stat card shows it: `'38s'`, `'2m'`. */
export function duration(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
): string {
  const from = parseInstant(startedAt);
  const to = parseInstant(endedAt);
  if (from === null || to === null || to < from) return EMPTY;

  const seconds = Math.floor((to - from) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

function parseInstant(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string' || iso.trim() === '') return null;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}
