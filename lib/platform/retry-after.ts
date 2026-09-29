/**
 * A refused request's `retry-after`, and the wait it asks for in words — backend
 * §12.1 #114, BUILD-PLAN 24.3.3. Ported from `snoopy/lib/retry-after.ts` so a
 * phone and a browser say the same thing about the same refusal.
 *
 * The Edge sends whole seconds (its flood limit and a plan's request limit both
 * answer 429 with one). An HTTP-date, a negative or a fractional value is not
 * something it sends, so it is not interpreted: the refusal is then said without
 * a time rather than with a guessed one.
 */
export function retryAfterSeconds(value: string | null | undefined): number | undefined {
  if (!value || !/^\d{1,6}$/u.test(value.trim())) return undefined;
  return Number(value.trim());
}

/** "Try again in 30 seconds." — or "in a moment" when no wait was stated. */
export function tryAgainIn(seconds: number | undefined): string {
  if (seconds === undefined) return 'Try again in a moment.';
  if (seconds <= 1) return 'Try again in a second.';
  if (seconds < 90) return `Try again in ${seconds} seconds.`;
  return `Try again in ${Math.ceil(seconds / 60)} minutes.`;
}

/**
 * A 429 in words a person can act on. Whichever limit refused, the answer is the
 * same — wait, then try again — and never "sign in".
 */
export function busyMessage(seconds: number | undefined): string {
  return `The platform is busy right now. ${tryAgainIn(seconds)}`;
}
