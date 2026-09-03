import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';

import type { components } from '@/lib/generated/platform-contracts/platform';
import { platformOperation } from './client';
import { backendApiOrigin } from './origin';
import { createPkcePair } from './pkce';
import { PlatformError, PlatformNotConfiguredError } from './problem';
import { notifySessionEnded, setSessionRecovery } from './session-recovery';
import { clearSession, readSession, writeSession, type StoredSession } from './session-store';

/**
 * Native login, per ADR-0017.
 *
 * The shape is unusual enough to be worth stating, because it is not the OAuth
 * dance an app normally runs. **This app is not the OAuth client** — the backend
 * is, and it keeps the provider's single allowlist entry. What the app owns is a
 * PKCE pair of its *own*, independent of the provider transaction, whose only
 * job is to bind the one-time code the callback hands back to this device:
 *
 *   1. app mints verifier + S256 challenge, opens the system browser at
 *      `/v1/auth/native/{provider}/start?redirect_uri&code_challenge`
 *   2. the browser carries the Edge's own transaction cookie; the app never
 *      reads it and does not need to
 *   3. the callback seals the unredeemed provider code and redirects to
 *      `redirect_uri` with it — no token material is ever in that URL
 *   4. the app POSTs the sealed code plus the verifier it never transmitted;
 *      the exchange happens server-side and returns the session
 *
 * Because the sealed code carries an unredeemed provider authorization code, it
 * is single-use by RFC 6749 §4.1.2 rather than by any server-side state.
 */

type NativeSession = components['schemas']['NativeSessionResponse'];

export type LoginProvider = 'google' | 'microsoft' | 'apple';

export type LoginOutcome =
  | { status: 'signed-in' }
  | { status: 'cancelled' }
  | { status: 'unconfigured'; message: string }
  | { status: 'failed'; message: string };

/** The redirect target, which must string-match the Edge's allowlist exactly. */
export function nativeRedirectUri(): string | null {
  const value = Constants.expoConfig?.extra?.nativeRedirectUri;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Where the system browser opens the start leg, or null for the API origin.
 *
 * The Edge keeps the OAuth transaction in a `__Host-` cookie, which is host-only
 * by definition, and its deployed callback sits on the public web origin behind
 * the website's `/api/platform` rewrite (manifest §12.1 #79). ADR-0017 §1 relies
 * on the start request and the provider's callback landing on ONE origin, so the
 * browser must open the start leg where the callback lives — not on the API
 * origin the app's bearer calls use. Measured 2026-09-03: the same start opened
 * on `api.autom8x.ai` sets a cookie the `www.autom8x.ai` callback never sees and
 * every login ends at the website with `exchange_failed`; opened through the
 * web origin, the callback 302s to the app with a sealed code.
 */
export function nativeAuthBaseUrl(): string | null {
  const value = Constants.expoConfig?.extra?.nativeAuthBaseUrl;
  return typeof value === 'string' && value.trim() !== '' ? value.trim().replace(/\/$/, '') : null;
}

/** What the system user-agent came back with, in the app's own vocabulary. */
export type AuthSessionOutcome =
  | { type: 'success'; url: string }
  | { type: 'cancelled' }
  | { type: 'failed'; message: string };

/**
 * `openAuthSessionAsync` throws when it cannot open a browser at all: Android's
 * `NoMatchingActivityException` on a device with no browser, and
 * `PREFERRED_PACKAGE_NOT_FOUND` when no Custom Tabs provider can be resolved.
 * Until Round 7.5M that rejection propagated out of `signInWithProvider` uncaught,
 * so a browserless device crashed the sign-in instead of being told why. Unreachable
 * on any normal phone; a robustness gap, closed here for both callers.
 */
const NO_BROWSER_CODES = new Set(['ERR_NO_MATCHING_ACTIVITY', 'PREFERRED_PACKAGE_NOT_FOUND']);

export async function openSystemAuthSession(
  url: string,
  returnTo: string,
): Promise<AuthSessionOutcome> {
  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(url, returnTo);
  } catch (error) {
    return { type: 'failed', message: describeBrowserFailure(error) };
  }
  // `dismiss` and `cancel` are a person closing the sheet, not a failure.
  if (result.type !== 'success') return { type: 'cancelled' };
  return { type: 'success', url: result.url };
}

function describeBrowserFailure(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  if (NO_BROWSER_CODES.has(code)) {
    return 'No web browser is available on this device to continue.';
  }
  return 'The system browser could not be opened.';
}

export async function signInWithProvider(provider: LoginProvider): Promise<LoginOutcome> {
  const origin = backendApiOrigin();
  if (!origin) {
    return { status: 'unconfigured', message: 'This build has no backend configured.' };
  }
  const redirectUri = nativeRedirectUri();
  if (!redirectUri) {
    // Failing here rather than falling back to `makeRedirectUri()` is deliberate:
    // that helper produces a custom scheme, which ADR-0008 rejects because any
    // app on a device can register one and the OS does not arbitrate.
    return {
      status: 'unconfigured',
      message: 'This build has no native redirect URI configured.',
    };
  }

  // The verifier never leaves the device until the exchange, and never travels
  // in a URL — only the challenge does.
  const { codeVerifier, codeChallenge } = await createPkcePair();

  // The browser-facing base, which must share an origin with the deployment's
  // callback; the API origin is only right when it IS that origin.
  const startUrl =
    `${nativeAuthBaseUrl() ?? origin}/v1/auth/native/${provider}/start` +
    `?redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&code_challenge=${encodeURIComponent(codeChallenge)}` +
    `&code_challenge_method=S256`;

  // The system browser, not a webview: it carries the Edge's transaction cookie
  // and shows the provider's real origin in the address bar, which a webview
  // cannot. RFC 8252 requires this, and DESIGN-CONTRACT restates it.
  const result = await openSystemAuthSession(startUrl, redirectUri);
  if (result.type === 'failed') return { status: 'failed', message: result.message };
  if (result.type === 'cancelled') return { status: 'cancelled' };

  const returned = new URL(result.url);
  if (!matchesNativeCallback(returned, redirectUri)) {
    return { status: 'failed', message: 'Sign-in returned to an unexpected address.' };
  }
  const failure = returned.searchParams.get('status');
  if (failure === 'error') {
    return { status: 'failed', message: describeCallbackError(returned.searchParams.get('reason')) };
  }
  const code = returned.searchParams.get('code');
  if (!code) return { status: 'failed', message: 'Sign-in did not complete.' };

  try {
    const session = await platformOperation<NativeSession>(
      '/v1/auth/native/token',
      ({ platform }, signal) =>
        platform.POST('/v1/auth/native/token', {
          body: { code, codeVerifier },
          signal,
        }),
    );
    await writeSession(toStoredSession(session));
    return { status: 'signed-in' };
  } catch (error) {
    return failureFrom(error);
  }
}

/**
 * The browser session already matches the claimed host/path on iOS 17.4+, but
 * the application checks the complete callback again before accepting a code.
 * Android's Custom Tab path completes through Linking, and this makes the same
 * exact-string policy hold on both platforms.
 */
export function matchesNativeCallback(returned: URL, configured: string): boolean {
  const expected = new URL(configured);
  return (
    returned.protocol === expected.protocol &&
    returned.username === '' &&
    returned.password === '' &&
    returned.host === expected.host &&
    returned.pathname === expected.pathname &&
    returned.hash === ''
  );
}

/**
 * Renew the session, or report that it is gone.
 *
 * The explicit outcome prevents the caller from treating two different kinds
 * of preservation as the same thing: a successful refresh may continue to
 * `/v1/session`, while an outage keeps the enclave entry but must stop before
 * sending its now-expired access token. Only 401 clears the enclave.
 */
export type RefreshOutcome =
  | { status: 'refreshed' }
  | { status: 'signed-out' }
  | { status: 'unavailable'; message: string };

/**
 * Teach the transport how to renew, without letting it import this module.
 *
 * Registered at load rather than by a caller: `hooks/use-session.tsx` imports
 * this module and the root layout mounts that provider, so the slot is filled
 * before any screen can issue a request. `recoverSession()` answers `false`
 * when it is not, which rethrows the original 401 — the fail-closed direction.
 *
 * The boolean is deliberately narrow. Only `refreshed` is a renewal; `unavailable`
 * is an outage and must NOT be reported as a renewal, or the transport would
 * retry with the same expired token and turn one 401 into two.
 */
setSessionRecovery(async () => {
  const outcome = await refreshSession();
  if (outcome.status === 'signed-out') notifySessionEnded();
  return outcome.status === 'refreshed';
});

export async function refreshSession(): Promise<RefreshOutcome> {
  const stored = await readSession();
  if (!stored) return { status: 'signed-out' };

  try {
    const session = await platformOperation<NativeSession>(
      '/v1/auth/native/refresh',
      ({ platform }, signal) =>
        platform.POST('/v1/auth/native/refresh', {
          body: { refreshToken: stored.refreshToken },
          signal,
        }),
    );
    await writeSession(toStoredSession(session));
    return { status: 'refreshed' };
  } catch (error) {
    if (error instanceof PlatformError && error.status === 401) {
      await clearSession();
      return { status: 'signed-out' };
    }
    // Unreachable, 502, 503 — the credential may well still be good. Keep it,
    // but do not immediately try the expired access token against `/v1/session`.
    return {
      status: 'unavailable',
      message: error instanceof Error ? error.message : 'The platform could not be reached.',
    };
  }
}

/**
 * End the session on this device.
 *
 * The refresh token is what actually revokes upstream, so it is sent rather than
 * merely discarded. A 502 means revocation failed: the tokens in the enclave are
 * still live, and deleting them would strand a session nobody can reach. The
 * contract answers 502 rather than 204 precisely so a client can tell.
 */
export async function signOut(): Promise<{ revoked: boolean }> {
  const stored = await readSession();
  if (!stored) return { revoked: true };

  try {
    await platformOperation<null>('/v1/auth/logout', ({ platform }, signal) =>
      platform.POST('/v1/auth/logout', {
        body: { refreshToken: stored.refreshToken },
        signal,
      }),
    );
  } catch (error) {
    // Only 400 and 401 are terminal answers about THIS token: the server has
    // read it and will not or need not revoke it, so the device's copy is spent
    // and clearing it strands nothing. Every other refusal — 502 unreachable,
    // 500, 503, a timeout — means the platform never got to say, and the
    // contract's rule is "clear locally only on a terminal/successful answer".
    // Clearing on those would delete the keychain entry for a session that is
    // still live upstream, which is precisely what ADR-0017 §4 answers 502 to
    // prevent; the difference is only visible to someone whose sign-out landed
    // during an outage, which is exactly when it matters.
    const terminal =
      error instanceof PlatformError && (error.status === 400 || error.status === 401);
    if (!terminal) return { revoked: false };
  }
  await clearSession();
  return { revoked: true };
}

function toStoredSession(session: NativeSession): StoredSession {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: Date.now() + session.expiresIn * 1000,
  };
}

function failureFrom(error: unknown): LoginOutcome {
  if (error instanceof PlatformNotConfiguredError) {
    return { status: 'unconfigured', message: 'This build has no backend configured.' };
  }
  if (error instanceof PlatformError) {
    if (error.status === 503) {
      // The deployment has not listed a redirect URI; native login is off.
      return { status: 'unconfigured', message: 'Sign-in is not available yet.' };
    }
    return { status: 'failed', message: error.message };
  }
  return { status: 'failed', message: 'Sign-in could not be completed.' };
}

/**
 * The callback's `reason` is a coarse token by design — the Edge does not say
 * which of forged/expired/replayed it was. Render one sentence per token and
 * nothing raw, so a crafted reason cannot put text on the screen.
 */
function describeCallbackError(reason: string | null): string {
  switch (reason) {
    case 'access_denied':
      return 'Sign-in was declined.';
    case 'not_configured':
      return 'Sign-in is not available yet.';
    default:
      return 'Sign-in could not be completed.';
  }
}
