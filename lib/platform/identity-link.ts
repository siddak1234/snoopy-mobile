import type { components } from '@/lib/generated/platform-contracts/platform';
import { platformOperation } from './client';
import {
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
    return { status: 'failed', message: describeLinkError(returned.searchParams.get('reason')) };
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
 * Why a link came back refused, by the callback's reason token (the owner's
 * build 13 decision 10A, TestFlight #19): one sentence per token, nothing raw,
 * so a crafted reason cannot put text on the screen. An account already linked
 * is never merged; the platform sends the same token whether it is linked to
 * another account or already to this one, so the sentence covers both.
 */
const LINK_ERRORS: Readonly<Record<string, string>> = {
  identity_already_linked:
    'That account is already linked, to this account or another. To link it here, unlink it from the other account first.',
  access_denied: 'Linking was declined.',
  linking_disabled: "Account linking isn't enabled on this platform yet.",
  not_configured: "Account linking isn't enabled on this platform yet.",
  provider_disabled: "That sign-in provider isn't available.",
  signup_disabled: "That account can't be linked: new sign-ups are closed.",
  account_disabled: 'That account is disabled.',
  email_unverified: "That account's email address isn't verified. Verify it with the provider, then try again.",
};

export function describeLinkError(reason: string | null): string {
  return reason !== null && Object.prototype.hasOwnProperty.call(LINK_ERRORS, reason)
    ? LINK_ERRORS[reason]!
    : 'The account could not be linked. Try again.';
}

/**
 * A sentence for each refusal, by its code — never the problem's title, which
 * is a category ("Dependency Failure") and read as a crash on the owner's phone
 * (backend §12.1 #200, BUILD-PLAN 24.9.6).
 */
function linkFailure(error: unknown): string {
  if (error instanceof PlatformError) {
    // A domain-only organization refused the account (decision 8B): the platform
    // undid the link, and this device keeps the session it had.
    if (error.status === 403 && error.details?.reason === 'outside_org_domain') {
      return "That account wasn't linked: its address is outside your organization's verified domains.";
    }
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
