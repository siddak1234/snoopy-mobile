import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';

import type { components } from '@/lib/generated/platform-contracts/platform';
import { platformJson } from './client';
import { backendApiOrigin } from './origin';
import { createPkcePair } from './pkce';
import { PlatformError, PlatformNotConfiguredError } from './problem';
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

  const startUrl =
    `${origin}/v1/auth/native/${provider}/start` +
    `?redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&code_challenge=${encodeURIComponent(codeChallenge)}` +
    `&code_challenge_method=S256`;

  // The system browser, not a webview: it carries the Edge's transaction cookie
  // and shows the provider's real origin in the address bar, which a webview
  // cannot. RFC 8252 requires this, and DESIGN-CONTRACT restates it.
  const result = await WebBrowser.openAuthSessionAsync(startUrl, redirectUri);
  if (result.type !== 'success') {
    // `dismiss` and `cancel` are a person closing the sheet, not a failure.
    return { status: 'cancelled' };
  }

  const returned = new URL(result.url);
  const failure = returned.searchParams.get('status');
  if (failure === 'error') {
    return { status: 'failed', message: describeCallbackError(returned.searchParams.get('reason')) };
  }
  const code = returned.searchParams.get('code');
  if (!code) return { status: 'failed', message: 'Sign-in did not complete.' };

  try {
    const session = await platformJson<NativeSession>('/v1/auth/native/token', {
      method: 'POST',
      body: { code, codeVerifier },
    });
    await writeSession(toStoredSession(session));
    return { status: 'signed-in' };
  } catch (error) {
    return failureFrom(error);
  }
}

/**
 * Renew the session, or report that it is gone.
 *
 * Returns `true` when a usable session remains. The 401/502 split is the whole
 * point: the contract says a client that treats an outage as a dead credential
 * "signs out every user who happened to open the app during it", so only 401
 * clears the enclave.
 */
export async function refreshSession(): Promise<boolean> {
  const stored = await readSession();
  if (!stored) return false;

  try {
    const session = await platformJson<NativeSession>('/v1/auth/native/refresh', {
      method: 'POST',
      body: { refreshToken: stored.refreshToken },
    });
    await writeSession(toStoredSession(session));
    return true;
  } catch (error) {
    if (error instanceof PlatformError && error.status === 401) {
      await clearSession();
      return false;
    }
    // Unreachable, 502, 503 — the credential may well still be good. Keep it.
    return true;
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
    await platformJson<null>('/v1/auth/logout', {
      method: 'POST',
      body: { refreshToken: stored.refreshToken },
    });
  } catch (error) {
    if (error instanceof PlatformError && error.status === 502) {
      return { revoked: false };
    }
    // 400/401 mean the server will not or need not revoke it; either way this
    // device's copy is spent, so fall through and clear.
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
