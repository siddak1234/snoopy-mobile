import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { components } from '@/lib/generated/platform-contracts/platform';
import { platformJson } from '@/lib/platform/client';
import {
  refreshSession,
  signInWithProvider,
  signOut as signOutOfPlatform,
  type LoginOutcome,
  type LoginProvider,
} from '@/lib/platform/native-auth';
import { PlatformError, PlatformNotConfiguredError } from '@/lib/platform/problem';
import { readSession } from '@/lib/platform/session-store';

/**
 * Who is signed in, and whether the app is allowed past the auth stack.
 *
 * The placement and the state names come from `DESIGN-CONTRACT.md`, which
 * specifies `hooks/use-session.tsx` and an `AuthState` of
 * `restoring | signed-out | submitting | signed-in | error`. `submitting`
 * belongs to a sign-in attempt and has nothing to submit yet — the Edge
 * publishes no operation that issues a session to a native client — so it is
 * absent rather than stubbed. `error` is split in two, because the difference
 * decides whether the guard fires:
 *
 * - `unconfigured` — no backend origin at all. This is the design prototype's
 *   normal state, and it must stay browsable: the UI is the asset this round
 *   exists to preserve, and locking it behind a session that cannot be obtained
 *   would destroy it. Not an authentication failure, so the guard stays open.
 * - `unavailable` — a configured backend did not answer. Also not an
 *   authentication failure; screens that have a designed error state show it.
 *
 * Only `signed-out` — an actual 401 from a reachable Edge — closes the guard.
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

export type SessionContextValue = SessionState & {
  /** Re-resolve the session — after signing in, or to retry an outage. */
  refresh: () => void;
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
          await refreshSession();
        }

        const session = await platformJson<SessionResponse>('/v1/session');
        if (!cancelled) setState({ status: 'signed-in', session });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof PlatformNotConfiguredError) {
          setState({ status: 'unconfigured' });
        } else if (error instanceof PlatformError && error.status === 401) {
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

  const signIn = useCallback(
    async (provider: LoginProvider) => {
      const outcome = await signInWithProvider(provider);
      // Only a completed sign-in changes what the app knows; a cancelled sheet
      // leaves the previous state exactly as it was.
      if (outcome.status === 'signed-in') refresh();
      return outcome;
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    const result = await signOutOfPlatform();
    // A failed revocation leaves the tokens in place on purpose, so the state
    // stays signed-in rather than claiming a sign-out that did not happen.
    if (result.revoked) setState({ status: 'signed-out' });
    return result;
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ ...state, refresh, signIn, signOut }),
    [state, refresh, signIn, signOut],
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
