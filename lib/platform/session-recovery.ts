/**
 * The one seam between the transport and the session.
 *
 * The transport has to be able to renew a credential — an access token that
 * expires while the app is open otherwise turns every screen into "Sign in is
 * required" with nothing that can clear it. But `lib/platform/client.ts` must
 * not import `lib/platform/native-auth.ts`, which imports the transport back:
 * a static cycle between the two would leave whichever module loaded second
 * holding a half-initialised copy of the other, and the failure would show up
 * as an undefined function at the first 401 rather than at build time.
 *
 * So the dependency is inverted through this module. It owns no behaviour and
 * no state beyond two slots: `native-auth` fills them when it loads, the
 * transport reads them when a request comes back 401, and `use-session`
 * listens on the second. Nothing here knows how a session is obtained.
 *
 * `hooks/use-session.tsx` imports `native-auth` and is mounted by the root
 * layout, so registration always happens before any screen can issue a request.
 * If it somehow has not, `recoverSession()` answers `false` and the 401 is
 * rethrown unchanged — the fail-closed direction.
 */

/** Renew the stored credential. `true` only when a fresh one was stored. */
type SessionRecovery = () => Promise<boolean>;

/** Told when a credential is proven dead, so the route guard can fail closed. */
type SessionEndedListener = () => void;

let recovery: SessionRecovery | null = null;
let listeners: SessionEndedListener[] = [];

/** Registered once by `lib/platform/native-auth.ts` when it loads. */
export function setSessionRecovery(next: SessionRecovery | null): void {
  recovery = next;
}

/**
 * Attempt a renewal, at most one at a time.
 *
 * Single-flight matters more here than it looks: a screen mounting three
 * parallel reads produces three simultaneous 401s, and three concurrent
 * refreshes would race to store three different sessions while the identity
 * provider invalidates the earlier refresh tokens. Every caller in one burst
 * therefore awaits the same promise and sees the same answer.
 */
let inFlight: Promise<boolean> | null = null;

export function recoverSession(): Promise<boolean> {
  if (!recovery) return Promise.resolve(false);
  if (!inFlight) {
    const fn = recovery;
    inFlight = fn().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** Subscribe to "the credential is gone"; returns its own unsubscribe. */
export function onSessionEnded(listener: SessionEndedListener): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
  };
}

/** Announce that the stored credential is dead and has been cleared. */
export function notifySessionEnded(): void {
  for (const listener of listeners) listener();
}

/** Test-only reset, so one suite's registration cannot leak into the next. */
export function resetSessionRecoveryForTests(): void {
  recovery = null;
  listeners = [];
  inFlight = null;
}
