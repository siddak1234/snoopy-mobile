jest.mock('@/lib/platform/account', () => ({
  unlinkIdentity: jest.fn(),
}));

import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import TabLayout from '@/app/(tabs)/_layout';
import { OutsideSignIn } from '@/components/outside-sign-in';
import { outsideSignIns, removeSignIn } from '@/lib/content/refusals';
import { PlatformError } from '@/lib/platform/problem';
import { notifyOutsideSignIn, resetSessionRecoveryForTests } from '@/lib/platform/session-recovery';
import { signedInSession } from '@/test/platform';
import { mockTabsDrawn, renderWithProviders } from '@/test/render';
import type { SessionContextValue } from '@/hooks/use-session';

const { unlinkIdentity } = jest.requireMock('@/lib/platform/account');

/**
 * The stage 1 spec's S1-11 (backend §12.1 #221, option b′): a domain-only
 * organization's workspace refuses, at session resolve, a person who holds a
 * sign-in outside its verified domains — 403 `outside_org_domain` naming those
 * sign-ins — until each is removed. The tabs' layout draws its own screen in
 * their place: the two lines and "Remove {provider} sign-in" for each, as the
 * website's.
 */

const LINES = [
  'This organization admits only people who sign in with addresses at its verified domains.',
  'Remove your other sign-in to continue.',
];

beforeEach(() => {
  unlinkIdentity.mockReset();
  resetSessionRecoveryForTests();
});

function session(overrides: Partial<SessionContextValue> = {}): SessionContextValue {
  return { ...signedInSession, reload: jest.fn(async () => ({ status: 'signed-in' as const })), signOut: jest.fn(async () => ({ revoked: true })), ...overrides } as SessionContextValue;
}

describe('the refusal names the sign-ins to remove', () => {
  it('each once, those this build knows; none, or another reason, is no screen', () => {
    expect(outsideSignIns({ reason: 'outside_org_domain', providers: ['google', 'apple', 'google', 'myspace'] })).toEqual(['google', 'apple']);
    expect(outsideSignIns({ reason: 'outside_org_domain', providers: ['myspace'] })).toBeNull();
    expect(outsideSignIns({ reason: 'outside_org_domain' })).toBeNull();
    expect(outsideSignIns({ reason: 'flow_change_requires_admin', providers: ['google'] })).toBeNull();
    expect(outsideSignIns(undefined)).toBeNull();
    expect([removeSignIn('google'), removeSignIn('microsoft'), removeSignIn('apple')]).toEqual([
      'Remove Google sign-in',
      'Remove Microsoft sign-in',
      'Remove Apple sign-in',
    ]);
  });
});

describe('the screen', () => {
  it('says the two lines and offers "Remove {provider} sign-in" for each; each removed is gone, and once none is left the session is read again and the tabs come back', async () => {
    const onCleared = jest.fn();
    const shown = session();
    unlinkIdentity.mockResolvedValue([]);
    await renderWithProviders(<OutsideSignIn providers={['google', 'microsoft']} onCleared={onCleared} />, shown);
    expect(screen.getByText(LINES[0]!)).toBeTruthy();
    expect(screen.getByText(LINES[1]!)).toBeTruthy();
    await fireEvent.press(screen.getByText('Remove Google sign-in'));
    await waitFor(() => expect(screen.queryByText('Remove Google sign-in')).toBeNull());
    expect(unlinkIdentity).toHaveBeenLastCalledWith('google');
    expect(onCleared).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('outside-remove-microsoft'));
    await waitFor(() => expect(onCleared).toHaveBeenCalled());
    expect(unlinkIdentity).toHaveBeenLastCalledWith('microsoft');
    expect(shown.reload).toHaveBeenCalled();
  });

  it("a removal the platform refuses is said in Settings' words, and the sign-in stays offered", async () => {
    unlinkIdentity.mockRejectedValue(new PlatformError('Conflict', 409, undefined, { reason: 'primary' }));
    const onCleared = jest.fn();
    await renderWithProviders(<OutsideSignIn providers={['google']} onCleared={onCleared} />, session());
    await fireEvent.press(screen.getByTestId('outside-remove-google'));
    expect((await screen.findByRole('alert')).props.children).toBe('The account you signed up with stays linked.');
    expect(screen.getByText('Remove Google sign-in')).toBeTruthy();
    expect(onCleared).not.toHaveBeenCalled();
  });

  it('Sign out stays offered, so a sign-in the platform will not unlink never strands the person', async () => {
    const shown = session();
    await renderWithProviders(<OutsideSignIn providers={['google']} onCleared={jest.fn()} />, shown);
    await fireEvent.press(screen.getByTestId('outside-sign-out'));
    await waitFor(() => expect(shown.signOut).toHaveBeenCalled());
  });
});

describe('the tabs layout', () => {
  it('draws the screen in the tabs\' place once the transport hears the refusal, and the tabs again once it is cleared', async () => {
    unlinkIdentity.mockResolvedValue([]);
    await renderWithProviders(<TabLayout />, session());
    expect(screen.queryByTestId('outside-sign-in')).toBeNull();
    mockTabsDrawn.mockClear();
    await act(async () => notifyOutsideSignIn({ reason: 'outside_org_domain', providers: ['apple'] }));
    expect(screen.getByTestId('outside-sign-in')).toBeTruthy();
    expect(screen.getByText('Remove Apple sign-in')).toBeTruthy();
    expect(screen.queryByTestId('status-bar-strip')).toBeNull();
    await fireEvent.press(screen.getByTestId('outside-remove-apple'));
    await waitFor(() => expect(screen.queryByTestId('outside-sign-in')).toBeNull());
    expect(screen.getByTestId('status-bar-strip')).toBeTruthy();
  });

  it('a refusal naming no sign-in this build knows leaves the tabs as they are', async () => {
    await renderWithProviders(<TabLayout />, session());
    await act(async () => notifyOutsideSignIn({ reason: 'outside_org_domain', providers: ['myspace'] }));
    expect(screen.queryByTestId('outside-sign-in')).toBeNull();
    expect(screen.getByTestId('status-bar-strip')).toBeTruthy();
  });
});
