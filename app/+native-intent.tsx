/**
 * What the router does with a link the system opens the app with (round 23,
 * A5 — the owner's build 22 item 8: "email → app link"). A run link
 * (`/runs/<id>`) and an approval link (`/approvals/<id>`), with any query, go
 * to Home: no screen of the app lives at those paths, so the router would show
 * "unmatched". The run's page or Approvals is opened from there, in the
 * workspace the link names, once signed in and past the lock
 * (`linkTargetOf` in `hooks/use-push-registration.tsx`). Every other path is
 * left as it came — the sign-in callback (`/auth/native/*`) above all.
 */
const RUN_OR_APPROVAL = /^\/(runs|approvals)\/[^/?#]+\/?$/u;

function pathnameOf(path: string): string {
  try {
    return new URL(path, 'https://app.invalid').pathname;
  } catch {
    return path;
  }
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return RUN_OR_APPROVAL.test(pathnameOf(path)) ? '/' : path;
}
