import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { components } from '@/lib/generated/platform-contracts/platform';
import { readCurrentSession } from '@/lib/platform/auth';
import {
  refreshSession,
  signInWithProvider,
  signOut as signOutOfPlatform,
  type LoginOutcome,
  type LoginProvider,
} from '@/lib/platform/native-auth';
import { PlatformError, PlatformNotConfiguredError } from '@/lib/platform/problem';
import { onSessionEnded } from '@/lib/platform/session-recovery';
import {
  clearSession,
  readFaceIdEnabled,
  readRememberSession,
  readSession,
  writeRememberSession,
} from '@/lib/platform/session-store';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { noteSignedOut } from '@/lib/view/cover-entrance';
import { forgetOpenScreen, noteSessionEnded, settleReturn } from '@/lib/view/return-to';

/**
 * Who is signed in, and whether the app is allowed past the auth stack.
 *
 * The placement and the state names come from `DESIGN-CONTRACT.md`, which
 * owns restoration, positive identity, and the two failure classes that decide
 * whether the guard fires. Provider submission remains local to the auth form,
 * because it disables that form without changing the last resolved session.
 *
 * `unconfigured` and `unavailable` are distinct so the auth screens can explain
 * whether this build lacks configuration or the platform is temporarily down.
 * Neither state is permission to enter the protected tab tree: the route guard
 * fails closed until the platform has positively resolved `signed-in`.
 *
 * Nor is `signed-in` alone, when the owner chose Face ID: the session is
 * `locked` until the lock's check passes (`locked` below; the build 13 review).
 */

type SessionResponse = components['schemas']['SessionResponse'];
export type WorkspaceSummary = components['schemas']['WorkspaceSummary'];

/** Renew this far ahead of expiry, to cover the round trip and clock drift. */
const EXPIRY_SKEW_MS = 30_000;

/**
 * The state of a session that has ended. The shared snapshot (24.9.1) is
 * emptied with it: its global entries — the workspace list, the providers —
 * would otherwise answer the next account on this device for up to their
 * window (24.12).
 */
function signedOut(ended = false): SessionState {
  resetSnapshot();
  return ended ? { status: 'signed-out', ended: true } : { status: 'signed-out' };
}

export type SessionState =
  | { status: 'restoring' }
  | { status: 'signed-in'; session: SessionResponse }
  /**
   * `ended`: the session ended while it was in use — a tab screen in front —
   * not by a sign-out, at a cold start, or in a sign-in that failed. The cover
   * says so, and the next sign-in returns to that screen (Gate 24 parity, G4;
   * `lib/view/return-to.ts`).
   */
  | { status: 'signed-out'; ended?: true }
  | { status: 'unconfigured' }
  | { status: 'unavailable'; message: string };

/**
 * What a mid-session re-read of `/v1/session` established.
 *
 * `unavailable` is deliberately NOT a state change: an outage while re-reading
 * does not un-sign a person, any more than it clears the enclave. The caller
 * that asked is told, and the last resolved session stays in force.
 */
export type SessionReloadOutcome =
  | { status: 'signed-in' }
  | { status: 'signed-out' }
  | { status: 'unavailable'; message: string };

export type SessionContextValue = SessionState & {
  /**
   * Whether the Face ID lock still holds this session (DESIGN-CONTRACT.md: an
   * enabled Face ID preference gates an existing session). A cold start locks
   * a stored session whose owner turned Face ID on, and the session is locked
   * until that is known, so nothing opens on a guess. The lock's own check
   * passing opens it (`unlock`), as do a sign-in — its own proof — and turning
   * Face ID off; only the next cold start locks again. The root guard admits
   * the tabs only `signed-in` AND unlocked, so a link that arrives while the
   * lock shows opens nothing: a tab, before, without Face ID (the build 13
   * review).
   */
  locked: boolean;
  /** The lock's check passed, or Face ID was turned off: nothing holds this session now. */
  unlock: () => void;
  /** Re-resolve the session — after signing in, or to retry an outage. */
  refresh: () => void;
  /**
   * Re-read `/v1/session` while signed in, without passing through `restoring`.
   *
   * `refresh()` re-runs the launch sequence and classifies a failed read as
   * `unavailable`, which the tab guard fails closed on — right at launch, wrong
   * after a mutation that succeeded: switching workspaces during a blip would
   * eject a person whose session is fine. This keeps the resolved session on
   * an outage and replaces it only with what the platform answered.
   */
  reload: () => Promise<SessionReloadOutcome>;
  signIn: (provider: LoginProvider, options?: { remember?: boolean }) => Promise<LoginOutcome>;
  signOut: () => Promise<{ revoked: boolean }>;
};

/**
 * Exported so a test can state the session directly instead of standing up a
 * network round trip to reach a known state — the guard's behaviour per state is
 * the thing worth asserting.
 */
export const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'restoring' });
  const [attempt, setAttempt] = useState(0);
  // Locked until the cold start says otherwise (`locked`, above).
  const [locked, setLocked] = useState(true);
  // Whether this run of the app has decided its lock: the first restore that
  // reaches a session, or a sign-in before it. A later restore (`refresh()`)
  // keeps what was decided: only a cold start locks.
  const lockDecided = useRef(false);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // A stored session that is at or past its expiry is renewed before the
        // first call, so the app does not open on a guaranteed 401. `EXPIRY_SKEW`
        // covers the round trip and a little clock drift. `refreshSession`
        // clears the enclave on a dead credential and keeps it on an outage.
        const stored = await readSession();
        // "Remember me" was off at sign-in: the session lasted until the app was
        // closed. A cold start ends it here, with nothing left in the enclave.
        if (stored && !(await readRememberSession())) {
          await clearSession();
          if (!cancelled) setState(signedOut());
          return;
        }
        if (stored && stored.expiresAt <= Date.now() + EXPIRY_SKEW_MS) {
          const outcome = await refreshSession();
          if (outcome.status === 'signed-out') {
            if (!cancelled) setState(signedOut());
            return;
          }
          if (outcome.status === 'unavailable') {
            if (!cancelled) setState({ status: 'unavailable', message: outcome.message });
            return;
          }
        }

        const session = await readCurrentSession();
        if (cancelled) return;
        // The cold start's lock, decided before the session is signed in, so
        // the guard never opens on a guess: a stored session whose owner turned
        // Face ID on stays locked until the lock's check passes.
        if (!lockDecided.current) {
          const lock = stored !== null && (await readFaceIdEnabled());
          if (cancelled) return;
          lockDecided.current = true;
          setLocked(lock);
        }
        setState({ status: 'signed-in', session });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof PlatformNotConfiguredError) {
          setState({ status: 'unconfigured' });
        } else if (error instanceof PlatformError && error.status === 401) {
          await clearSession();
          setState(signedOut());
        } else {
          setState({
            status: 'unavailable',
            message: error instanceof Error ? error.message : 'The platform could not be reached.',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  /**
   * The transport proved the credential dead and cleared the enclave.
   *
   * Without this the guard would keep rendering the protected tree from the
   * last resolved session while every read 401s — signed-in in the UI and
   * signed-out on the platform. Moving to `signed-out` is what makes the
   * layout's fail-closed rule apply to a session that expired mid-use, not
   * only to one that was already gone at launch.
   *
   * Ended on a tab screen, it is `ended`: the cover says why, and that screen
   * is owed to the next sign-in (Gate 24 parity, G4). The same end can be told
   * twice — the transport's announcement, then the re-read that met it
   * (`reload`) — and the second keeps what the first said.
   */
  const endSession = useCallback(() => {
    const next = signedOut(noteSessionEnded());
    setState((previous) => (previous.status === 'signed-out' ? previous : next));
  }, []);

  useEffect(() => onSessionEnded(endSession), [endSession]);

  const signIn = useCallback(
    async (provider: LoginProvider, options?: { remember?: boolean }) => {
      const outcome = await signInWithProvider(provider);
      if (outcome.status === 'signed-in') {
        try {
          // The choice made beside the provider buttons, kept with the tokens.
          await writeRememberSession(options?.remember ?? true);
          // Resolve the protected projection before returning success. Routing
          // first would race the fail-closed tab guard and bounce a valid login.
          const session = await readCurrentSession();
          // A new session begins: nothing an earlier one read answers it, and
          // a screen an ended one left is owed only to its own person (G4).
          resetSnapshot();
          settleReturn(session.user.userId);
          // A sign-in is its own proof: whatever a cold start locked is open.
          lockDecided.current = true;
          setLocked(false);
          setState({ status: 'signed-in', session });
        } catch (error) {
          if (error instanceof PlatformError && error.status === 401) {
            await clearSession();
            setState(signedOut());
          }
          return {
            status: 'failed' as const,
            message: error instanceof Error ? error.message : 'Sign-in could not be completed.',
          };
        }
      }
      return outcome;
    },
    [],
  );

  const reload = useCallback(async (): Promise<SessionReloadOutcome> => {
    try {
      const session = await readCurrentSession();
      setState({ status: 'signed-in', session });
      return { status: 'signed-in' };
    } catch (error) {
      // The transport has already renewed once and retried once by the time a
      // 401 reaches here, so it is the credential's final answer.
      if (error instanceof PlatformError && error.status === 401) {
        await clearSession();
        endSession();
        return { status: 'signed-out' };
      }
      return {
        status: 'unavailable',
        message: error instanceof Error ? error.message : 'The platform could not be reached.',
      };
    }
  }, [endSession]);

  const signOut = useCallback(async () => {
    const result = await signOutOfPlatform();
    // A failed revocation leaves the tokens in place on purpose, so the state
    // stays signed-in rather than claiming a sign-out that did not happen.
    if (result.revoked) {
      // The cover that follows is shown at once, not faded in (build 13 decision 1).
      noteSignedOut();
      // Signed out on purpose, nothing is owed: not even a screen a 401 that
      // landed during the sign-out noted (G4).
      forgetOpenScreen();
      setState(signedOut());
    }
    return result;
  }, []);

  // Only ever called once the lock is decided: the lock asks for its check
  // only signed in, and Settings' row is behind the guard.
  const unlock = useCallback(() => setLocked(false), []);

  const value = useMemo<SessionContextValue>(
    () => ({ ...state, locked, unlock, refresh, reload, signIn, signOut }),
    [state, locked, unlock, refresh, reload, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside a SessionProvider');
  return value;
}

/**
 * The workspace whose data the screens read.
 *
 * Ported from `snoopy/lib/tenancy.ts`: prefer the session's active selection,
 * fall back to the first membership. Never taken from a form field — the server
 * authorises the workspace in the path, and a client-chosen value is how one
 * tenant asks for another's data.
 */
export function activeWorkspaceId(state: SessionState): string | null {
  if (state.status !== 'signed-in') return null;
  return state.session.user.activeWorkspaceId ?? state.session.workspaces[0]?.id ?? null;
}

/**
 * The workspace an action acts on: the active one, only while it is still the one
 * the screen loaded — otherwise `null`, and the action is refused in words
 * (`WORKSPACE_CHANGED`) rather than sent (BUILD-PLAN 24.3.6).
 *
 * A tab keeps its screen mounted while the person switches workspace elsewhere,
 * so a control can outlive the data it was drawn for; the web met the same
 * defect across browser tabs (`snoopy` F69–F77, its `activeWorkspaceIfShown`).
 * The screen's loaded id is only compared: the path an action uses is always the
 * session's, never a value the screen holds.
 */
export function workspaceIfShown(
  state: SessionState,
  shownWorkspaceId: string | null | undefined,
): string | null {
  const active = activeWorkspaceId(state);
  return active && shownWorkspaceId && active === shownWorkspaceId ? active : null;
}

/**
 * The person's role in a workspace, from the session's memberships — what
 * `administers()` is asked about for the workspace a screen loaded.
 */
export function roleIn(
  state: SessionState,
  workspaceId: string | null | undefined,
): WorkspaceSummary['role'] | undefined {
  if (state.status !== 'signed-in' || !workspaceId) return undefined;
  return state.session.workspaces.find((workspace) => workspace.id === workspaceId)?.role;
}

/**
 * The scope any client-held override belongs to: this person, in this workspace.
 *
 * `hooks/use-solutions.tsx` and `hooks/use-workflows.tsx` layer local overrides
 * on top of server truth, and both providers are mounted above the route tree
 * so they outlive a sign-out. Keying their reset on this string means one
 * expression decides all three boundaries — signed out, a different account,
 * and a workspace switch — instead of three effects that can disagree.
 * Signed-out deliberately collapses to a single constant, so any two
 * signed-out periods are the same scope and clear the same way.
 */
export function overrideScopeKey(state: SessionState): string {
  if (state.status !== 'signed-in') return 'signed-out';
  return `${state.session.user.userId}:${activeWorkspaceId(state) ?? 'no-workspace'}`;
}
