import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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
import { clearSession, readSession } from '@/lib/platform/session-store';

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
 */

type SessionResponse = components['schemas']['SessionResponse'];
export type WorkspaceSummary = components['schemas']['WorkspaceSummary'];

/** Renew this far ahead of expiry, to cover the round trip and clock drift. */
const EXPIRY_SKEW_MS = 30_000;

export type SessionState =
  | { status: 'restoring' }
  | { status: 'signed-in'; session: SessionResponse }
  | { status: 'signed-out' }
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
  signIn: (provider: LoginProvider) => Promise<LoginOutcome>;
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
        if (stored && stored.expiresAt <= Date.now() + EXPIRY_SKEW_MS) {
          const outcome = await refreshSession();
          if (outcome.status === 'signed-out') {
            if (!cancelled) setState({ status: 'signed-out' });
            return;
          }
          if (outcome.status === 'unavailable') {
            if (!cancelled) setState({ status: 'unavailable', message: outcome.message });
            return;
          }
        }

        const session = await readCurrentSession();
        if (!cancelled) setState({ status: 'signed-in', session });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof PlatformNotConfiguredError) {
          setState({ status: 'unconfigured' });
        } else if (error instanceof PlatformError && error.status === 401) {
          await clearSession();
          setState({ status: 'signed-out' });
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
   */
  useEffect(() => onSessionEnded(() => setState({ status: 'signed-out' })), []);

  const signIn = useCallback(
    async (provider: LoginProvider) => {
      const outcome = await signInWithProvider(provider);
      if (outcome.status === 'signed-in') {
        try {
          // Resolve the protected projection before returning success. Routing
          // first would race the fail-closed tab guard and bounce a valid login.
          const session = await readCurrentSession();
          setState({ status: 'signed-in', session });
        } catch (error) {
          if (error instanceof PlatformError && error.status === 401) {
            await clearSession();
            setState({ status: 'signed-out' });
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
        setState({ status: 'signed-out' });
        return { status: 'signed-out' };
      }
      return {
        status: 'unavailable',
        message: error instanceof Error ? error.message : 'The platform could not be reached.',
      };
    }
  }, []);

  const signOut = useCallback(async () => {
    const result = await signOutOfPlatform();
    // A failed revocation leaves the tokens in place on purpose, so the state
    // stays signed-in rather than claiming a sign-out that did not happen.
    if (result.revoked) setState({ status: 'signed-out' });
    return result;
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ ...state, refresh, reload, signIn, signOut }),
    [state, refresh, reload, signIn, signOut],
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
