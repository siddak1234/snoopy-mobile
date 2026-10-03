jest.mock('@/lib/platform/client', () => ({ platformOperation: jest.fn(), newIdempotencyKey: jest.fn(() => 'k') }));
jest.mock('@/lib/platform/session-store', () => ({
  readSession: jest.fn(async () => ({ accessToken: 'a1', refreshToken: 'refresh-1', expiresAt: 0 })),
  writeSession: jest.fn(),
  clearSession: jest.fn(async () => undefined),
  readFaceIdEnabled: jest.fn(async () => false),
  writeFaceIdEnabled: jest.fn(),
  readAccessToken: jest.fn(),
}));
jest.mock('@/lib/platform/identity-link', () => ({ linkIdentity: jest.fn() }));

import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import AccountScreen from '@/app/(tabs)/settings/account';
import { nocturneDark, nocturneLight } from '@/constants/theme';
import type { SessionContextValue } from '@/hooks/use-session';
import { DELETE_ACCOUNT_BODY, DELETION_WORDS } from '@/lib/content/deletion';
import { PlatformError } from '@/lib/platform/problem';
import { fakePlatform } from '@/test/fake-platform';
import { signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

const { platformOperation } = jest.requireMock('@/lib/platform/client');
const { clearSession } = jest.requireMock('@/lib/platform/session-store');
const { linkIdentity } = jest.requireMock('@/lib/platform/identity-link');

function session(signOut = jest.fn(async () => ({ revoked: true }))) {
  return { ...signedInSession, signOut, refresh: jest.fn(), reload: jest.fn(async () => ({ status: 'signed-in' as const })) } as SessionContextValue & {
    signOut: jest.Mock;
    refresh: jest.Mock;
  };
}

function route() {
  const fake = fakePlatform(platformOperation);
  fake.always('GET /v1/auth/identities', { identities: [{ provider: 'google', primary: true }] });
  fake.always('GET /v1/auth/providers', {
    providers: [
      { id: 'google', label: 'Google' },
      { id: 'apple', label: 'Apple' },
    ],
    passwordLoginEnabled: false,
    magicLinkLoginEnabled: false,
  });
  return fake;
}

async function openDelete() {
  await fireEvent.press(await screen.findByText('Delete Account'));
  expect(await screen.findByText('Delete account?')).toBeTruthy();
  expect(screen.getByText(DELETE_ACCOUNT_BODY[0])).toBeTruthy();
  expect(screen.getByText(DELETE_ACCOUNT_BODY[1])).toBeTruthy();
  await fireEvent.press(screen.getByText('Yes, delete my account'));
}

describe('Linked accounts (24.6.2, on 24.2.1)', () => {
  it('shows what is linked and links another through the native flow', async () => {
    const fake = route();
    linkIdentity.mockResolvedValue({ status: 'linked' });
    const current = session();
    await renderWithProviders(<AccountScreen />, current);
    expect(await screen.findByText('Primary')).toBeTruthy();
    const reads = fake.to('GET /v1/auth/identities').length;
    await fireEvent.press(screen.getByTestId('link-apple'));
    await waitFor(() => expect(linkIdentity).toHaveBeenCalledWith('apple'));
    await waitFor(() => expect(fake.to('GET /v1/auth/identities').length).toBe(reads + 1));
  });

  it('shows the address a linked account reports, muted under its name — none when it reports none, none when not linked (24.12)', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/auth/identities', {
      identities: [
        { provider: 'google', primary: true, email: 'alex@acme.co' },
        { provider: 'microsoft', primary: false },
      ],
    });
    fake.always('GET /v1/auth/providers', {
      providers: [
        { id: 'google', label: 'Google' },
        { id: 'microsoft', label: 'Microsoft' },
        { id: 'apple', label: 'Apple' },
      ],
      passwordLoginEnabled: false,
      magicLinkLoginEnabled: false,
    });
    await renderWithProviders(<AccountScreen />, session());
    const google = await screen.findByTestId('identity-google');
    const address = within(google).getByText('alex@acme.co');
    expect((StyleSheet.flatten(address.props.style) as { color?: string }).color).toBe(nocturneDark.neutral[400]);
    // Linked, but its provider reported no address; and not linked at all.
    expect(within(screen.getByTestId('identity-microsoft')).queryByText(/@/u)).toBeNull();
    expect(within(screen.getByTestId('identity-apple')).queryByText(/@/u)).toBeNull();
  });
});

describe('Deleting the account (24.6.2, ADR-0028)', () => {
  it('deleted: lets go of the session on this device and shows the signed-out screen', async () => {
    const fake = route();
    fake.always('DELETE /v1/account', { deleted: true });
    const current = session();
    await renderWithProviders(<AccountScreen />, current);
    await openDelete();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/account-deleted'));
    expect(clearSession).toHaveBeenCalled();
    expect(current.refresh).toHaveBeenCalled();
    expect(fake.to('DELETE /v1/account')[0]!.body).toEqual({ refreshToken: 'refresh-1' });
  });

  it('a partial deletion keeps the account and this device signed in', async () => {
    const fake = route();
    fake.always('DELETE /v1/account', () => {
      throw new PlatformError('Conflict', 409);
    });
    await renderWithProviders(<AccountScreen />, session());
    await openDelete();
    expect(await screen.findByText(DELETION_WORDS.retry)).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('deleted but not revoked: revokes through sign-out before letting go, and says so if it cannot', async () => {
    const fake = route();
    fake.always('DELETE /v1/account', () => {
      throw new PlatformError('Revocation failed', 502, 'SESSION_REVOCATION_FAILED');
    });
    const signOut = jest.fn(async () => ({ revoked: false }));
    await renderWithProviders(<AccountScreen />, session(signOut));
    await openDelete();
    expect(await screen.findByText(DELETION_WORDS.notRevoked)).toBeTruthy();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();

    signOut.mockResolvedValue({ revoked: true });
    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/account-deleted'));
    // The retry only revokes; the account is not deleted a second time.
    expect(fake.to('DELETE /v1/account')).toHaveLength(1);
  });

  it('a lost answer reads the session before saying either way', async () => {
    const fake = route();
    fake.always('DELETE /v1/account', () => {
      throw new PlatformError('Dependency failure', 502, 'DEPENDENCY_FAILURE');
    });
    fake.once('GET /v1/session', () => {
      throw new PlatformError('Unauthenticated', 401);
    });
    await renderWithProviders(<AccountScreen />, session());
    await openDelete();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/account-deleted'));
  });

  it('a lost answer with the session still there says the account is still here', async () => {
    const fake = route();
    fake.always('DELETE /v1/account', () => {
      throw new PlatformError('Dependency failure', 502, 'DEPENDENCY_FAILURE');
    });
    fake.always('GET /v1/session', { user: { userId: 'u1', email: 'alex@acme.co' }, workspaces: [] });
    await renderWithProviders(<AccountScreen />, session());
    await openDelete();
    expect(await screen.findByText(DELETION_WORDS.stillHere)).toBeTruthy();
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('an ended session offers sign-in, never the destructive button again', async () => {
    const fake = route();
    fake.always('DELETE /v1/account', () => {
      throw new PlatformError('Unauthenticated', 401);
    });
    await renderWithProviders(<AccountScreen />, session());
    await openDelete();
    expect(await screen.findByText(DELETION_WORDS.expired)).toBeTruthy();
    expect(screen.getByText('Sign in again')).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
  });
});

describe('Unlinking a sign-in account (backend 24.11.1)', () => {
  function routeLinked() {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/auth/identities', {
      identities: [
        { provider: 'google', primary: true },
        { provider: 'apple', primary: false },
      ],
    });
    fake.always('GET /v1/auth/providers', {
      providers: [
        { id: 'google', label: 'Google' },
        { id: 'apple', label: 'Apple' },
      ],
      passwordLoginEnabled: false,
      magicLinkLoginEnabled: false,
    });
    return fake;
  }

  it('offers Unlink on a linked account and never on the primary; confirms; sends the refresh token; re-reads', async () => {
    const fake = routeLinked();
    fake.always('POST /v1/auth/native/identities/{provider}/unlink', {
      identities: [{ provider: 'google', primary: true }],
    });
    await renderWithProviders(<AccountScreen />, session());
    expect(await screen.findByText('Primary')).toBeTruthy();
    expect(screen.queryByTestId('unlink-google')).toBeNull();
    const reads = fake.to('GET /v1/auth/identities').length;
    await fireEvent.press(screen.getByTestId('unlink-apple'));
    expect(await screen.findByText('Unlink Apple?')).toBeTruthy();
    await fireEvent.press(within(screen.getByTestId('unlink-dialog')).getByText('Unlink'));
    await waitFor(() => expect(fake.to('POST /v1/auth/native/identities/{provider}/unlink').length).toBe(1));
    const sent = fake.to('POST /v1/auth/native/identities/{provider}/unlink')[0];
    expect(sent?.values).toEqual({ provider: 'apple' });
    expect(sent?.body).toEqual({ refreshToken: 'refresh-1' });
    await waitFor(() => expect(fake.to('GET /v1/auth/identities').length).toBe(reads + 1));
  });

  it.each(['dark', 'light'] as const)(
    "draws Delete Account, Unlink and Unlink's confirm in the theme's red (the owner's build 12 item 5; %s)",
    async (mode) => {
      const palette = mode === 'dark' ? nocturneDark : nocturneLight;
      const color = (node: { props: { style?: unknown } }) => (StyleSheet.flatten(node.props.style) as { color?: string }).color;
      routeLinked();
      await renderWithProviders(<AccountScreen />, session(), mode);
      expect(color(await screen.findByText('Delete Account'))).toBe(palette.danger);
      expect(color(screen.getByText('Unlink'))).toBe(palette.danger);
      // Link, the way on, is not red.
      expect(color(within(screen.getByTestId('identity-google')).getByText('Primary'))).not.toBe(palette.danger);
      await fireEvent.press(screen.getByTestId('unlink-apple'));
      expect(color(within(await screen.findByTestId('unlink-dialog')).getByText('Unlink'))).toBe(palette.danger);
    },
  );

  /** Unlink Apple, refused as `refusal` — a PlatformError carrying the problem's TITLE, as the transport builds it. */
  async function unlinkRefused(refusal: PlatformError) {
    const fake = routeLinked();
    fake.always('POST /v1/auth/native/identities/{provider}/unlink', () => {
      throw refusal;
    });
    await renderWithProviders(<AccountScreen />, session());
    await fireEvent.press(await screen.findByTestId('unlink-apple'));
    await fireEvent.press(within(await screen.findByTestId('unlink-dialog')).getByText('Unlink'));
  }

  it('says a refused unlink in words by its reason, never the problem title (24.12)', async () => {
    await unlinkRefused(new PlatformError('Bad Request', 400, 'BAD_REQUEST', { reason: 'last' }));
    expect(await screen.findByText('The last sign-in account stays linked.')).toBeTruthy();
    expect(screen.queryByText('Bad Request')).toBeNull();
  });

  it('says the account you signed up with stays linked (reason primary)', async () => {
    await unlinkRefused(new PlatformError('Bad Request', 400, 'BAD_REQUEST', { reason: 'primary' }));
    expect(await screen.findByText('The account you signed up with stays linked.')).toBeTruthy();
  });

  it('says a provider refusal in words (reason refused)', async () => {
    await unlinkRefused(new PlatformError('Bad Request', 400, 'BAD_REQUEST', { reason: 'refused' }));
    expect(await screen.findByText('This sign-in account cannot be unlinked.')).toBeTruthy();
  });

  it("says unlinking isn't available yet where the platform has no such route — build 9's \"Not Found\"", async () => {
    await unlinkRefused(
      new PlatformError('Not Found', 404, 'NOT_FOUND', { method: 'POST', path: '/v1/auth/native/identities/apple/unlink' }),
    );
    expect(await screen.findByText("Unlinking isn't available yet.")).toBeTruthy();
    expect(screen.queryByText('Not Found')).toBeNull();
  });

  it('says an account that is not linked is not linked (a plain 404)', async () => {
    await unlinkRefused(new PlatformError('Not Found', 404, 'NOT_FOUND'));
    expect(await screen.findByText('That sign-in account is not linked.')).toBeTruthy();
  });

  it('falls back to its own sentence for anything else', async () => {
    await unlinkRefused(new PlatformError('Dependency Failure', 502, 'DEPENDENCY_FAILURE'));
    expect(await screen.findByText('The account could not be unlinked.')).toBeTruthy();
    expect(screen.queryByText('Dependency Failure')).toBeNull();
  });
});
