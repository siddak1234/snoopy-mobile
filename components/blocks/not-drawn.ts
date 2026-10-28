/**
 * The app's one log line (round 21, design D2.6): a part of a page that was not
 * drawn — a block of a type this build does not know (`unknown type`), a page
 * body that is `no blocks` or `not a list`, a block missing a required field
 * (`drawable.ts`), a block whose
 * renderer threw (`Catch` around each block), a dialog or form that threw
 * (`DialogBoundary`, `InlineBoundary`) or a screen that threw (the root
 * layout's `ErrorBoundary`). `type` is the block's `type`, or `unknown`;
 * `error` is why: the missing field's name, `unknown type`, `no blocks`,
 * `not a list`, or the caught error. No block text or
 * value is logged: those are the customer's. The platform checks every block
 * at the callback, so a line here means the app and the platform disagree, a
 * bug for the platform session. It reaches the phone's system log (Xcode ›
 * Devices, or Console.app with the phone attached); no reporting service.
 *
 * The only `console` call `audit:platform` admits, in this file alone.
 */
export function notDrawn(type: string, error: unknown): void {
  console.error('block not drawn', { type, error });
}
