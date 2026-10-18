import { PlatformNotConfiguredError, PlatformRateLimitedError, PlatformUnreachableError } from '@/lib/platform/problem';

/**
 * Home's reads stand each on its own (Gate 24 parity, G6) — the website's
 * dashboard (`snoopy/app/account/page.tsx`): a figure the platform refused or
 * could not answer reads "Unavailable" and the rest still show, rather than one
 * read taking the whole of Home with it.
 *
 * ~~`flowsFigure` and `integrationsFigure`, OVERVIEW's two figures (G6), and
 * `quickRunRows`, RUN A FLOW's rows (Build 21, spec A9)~~ until Build 22: the
 * owner's build 21 item 1 — "Remove run a flow section. We did not add thus. /
 * Remove overflow … I dont want want flows integrations, connect integrations,
 * view teams, or run a flow."
 */

/**
 * Why nothing on Home could be read, when nothing could: the refusal its own
 * failure state is worded by (G3). A 429 first, which states its wait; then any
 * answer the platform gave; then a request that never landed; and with no
 * backend or no workspace, that.
 */
export function homeFailure(errors: readonly unknown[]): unknown {
  return (
    errors.find((error) => error instanceof PlatformRateLimitedError) ??
    errors.find(
      (error) => !(error instanceof PlatformUnreachableError) && !(error instanceof PlatformNotConfiguredError),
    ) ??
    errors.find((error) => error instanceof PlatformUnreachableError) ??
    errors[0]
  );
}
