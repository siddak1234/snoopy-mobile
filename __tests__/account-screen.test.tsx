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

import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import AccountScreen from '@/app/(tabs)/settings/account';
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
