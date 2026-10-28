/**
 * The app's one log line (round 21, design D2.6): a part of a page that was not
 * drawn, through `NotDrawnFallback` (`fallback.tsx`), or a block, dialog, form
 * or screen that threw, through `Catch` and the root layout's `ErrorBoundary`.
 * `type` is the block's `type`, or `unknown`; `error` is why, or the caught
 * error. Each reason is listed once, in DESIGN-CONTRACT.md, "A block that
 * cannot be drawn". No block text or value is logged: those are the
 * customer's. The platform checks every block
 * at the callback, so a line here means the app and the platform disagree, a
 * bug for the platform session. It reaches the phone's system log (Xcode ›
 * Devices, or Console.app with the phone attached); no reporting service.
 *
 * The only `console` call `audit:platform` admits, in this file alone.
 */
export function notDrawn(type: string, error: unknown): void {
  console.error('block not drawn', { type, error });
}
