/**
 * What the router does with a link the system opens the app with (round 23,
 * A5 — the owner's build 22 item 8: "email → app link"). No screen of the
 * app lives at a run link (`/runs/<id>`) or an approval link
 * (`/approvals/<id>`), with any query, so the router would show "unmatched".
 * The link that starts the app goes to `/`, the splash, which leaves for the
 * workspace as always. One that arrives while the app is open goes nowhere
 * (an empty path, which expo-router drops): the open screen stays — `/` from
 * there would be the cover, above Sign in or the tabs. Either way the run's
 * page or Approvals is opened in the workspace the link names, once signed in
 * and past the lock (`linkTargetOf` in `hooks/use-push-registration.tsx`).
 * Every other path is left as it came — the sign-in callback
 * (`/auth/native/*`) above all.
 */
const RUN_OR_APPROVAL = /^\/(runs|approvals)\/[^/?#]+\/?$/u;

function pathnameOf(path: string): string {
  try {
    return new URL(path, 'https://app.invalid').pathname;
  } catch {
    return path;
  }
}

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  if (!RUN_OR_APPROVAL.test(pathnameOf(path))) return path;
  return initial ? '/' : '';
}
