import type { components } from '@/lib/generated/platform-contracts/platform';
import { platformOperation } from './client';
import {
  describeCallbackError,
  matchesNativeCallback,
  nativeAuthBaseUrl,
  nativeRedirectUri,
  openSystemAuthSession,
  toStoredSession,
  type LoginProvider,
} from './native-auth';
import { backendApiOrigin } from './origin';
import { createPkcePair } from './pkce';
import { PlatformError } from './problem';
import { readSession, writeSession } from './session-store';

type NativeSession = components['schemas']['NativeSessionResponse'];

export type LinkOutcome =
  | { status: 'linked' }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

/**
 * Link another sign-in account to this one — ADR-0017 §6, backend 24.2.1, the
 * website's "Link" on the same transaction.
 *
 * A browser cannot carry the app's bearer, so the Edge seals the link
 * transaction into a TICKET the app asks for with its bearer and refresh token,
 * and opens once, in the system browser. From the provider on it is login's
 * native flow: a one-time code comes back to the claimed redirect URI and is
 * traded, with this device's PKCE verifier, for a session that now carries the
 * linked identity. The refresh token travels in a request body, never a URL.
 */
export async function linkIdentity(provider: LoginProvider): Promise<LinkOutcome> {
  const origin = backendApiOrigin();
  const redirectUri = nativeRedirectUri();
  if (!origin || !redirectUri) return { status: 'failed', message: 'Linking is not available in this build.' };

  const { codeVerifier, codeChallenge } = await createPkcePair();
  let ticket: string;
  try {
    // The refresh token is read inside the request: if the Edge refuses a
    // near-expiry access token (401) the transport renews once and retries, and
    // the retry must send the renewed refresh token, not the one renewal spent.
    const answer = await platformOperation(`/v1/auth/native/identities/${provider}/ticket`, async ({ platform }, signal) => {
      const stored = await readSession();
      return platform.POST('/v1/auth/native/identities/{provider}/ticket', {
        params: { path: { provider } },
        body: { refreshToken: stored?.refreshToken ?? '', redirectUri, codeChallenge },
        signal,
      });
    });
    ticket = answer.ticket;
  } catch (error) {
    return { status: 'failed', message: linkFailure(error) };
  }

  const startUrl = `${nativeAuthBaseUrl() ?? origin}/v1/auth/native/identities/${provider}/start?ticket=${encodeURIComponent(ticket)}`;
  const result = await openSystemAuthSession(startUrl, redirectUri);
  if (result.type === 'failed') return { status: 'failed', message: result.message };
  if (result.type === 'cancelled') return { status: 'cancelled' };

  const returned = new URL(result.url);
  if (!matchesNativeCallback(returned, redirectUri)) {
    return { status: 'failed', message: 'Linking returned to an unexpected address.' };
  }
  if (returned.searchParams.get('status') === 'error') {
    return { status: 'failed', message: describeCallbackError(returned.searchParams.get('reason')) };
  }
  const code = returned.searchParams.get('code');
  if (!code) return { status: 'failed', message: 'Linking did not complete.' };

  try {
    const session = await platformOperation<NativeSession>('/v1/auth/native/token', ({ platform }, signal) =>
      platform.POST('/v1/auth/native/token', { body: { code, codeVerifier }, signal }),
    );
    await writeSession(toStoredSession(session));
    return { status: 'linked' };
  } catch (error) {
    return { status: 'failed', message: linkFailure(error) };
  }
}

/**
 * A sentence for each refusal, by its code — never the problem's title, which
 * is a category ("Dependency Failure") and read as a crash on the owner's phone
 * (backend §12.1 #200, BUILD-PLAN 24.9.6).
 */
function linkFailure(error: unknown): string {
  if (error instanceof PlatformError) {
    if (error.code === 'NOT_CONFIGURED' || error.status === 503) {
      return "Account linking isn't enabled on this platform yet.";
    }
    if (error.code === 'DEPENDENCY_FAILURE' || error.status === 502) {
      return "The sign-in provider couldn't be reached. Try again in a moment.";
    }
    if (error.status === 429) return error.message;
    return 'The account could not be linked.';
  }
  return 'The account could not be linked.';
}
