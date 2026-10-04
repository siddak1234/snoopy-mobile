import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import TabLayout from '@/app/(tabs)/_layout';
import SettingsScreen from '@/app/(tabs)/settings';
import { resetPushForTests } from '@/hooks/use-push-registration';
import type { SessionContextValue } from '@/hooks/use-session';
import type { Answer } from '@/test/fake-platform';
import { SIGN_OUT_FAILED } from '@/lib/content/screen-states';
import { signOut as signOutOfPlatform } from '@/lib/platform/native-auth';
import { PlatformError } from '@/lib/platform/problem';
import { routePlatform } from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

// A keychain that keeps what it is given, so the real sign-out can run end to
// end (build 11, D8). Empty unless a test fills it.
jest.mock('expo-secure-store', () => {
  const kept = new Map();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    kept,
    getItemAsync: jest.fn(async (key: string) => kept.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      kept.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      kept.delete(key);
    }),
  };
});
const { kept } = jest.requireMock('expo-secure-store') as { kept: Map<string, string> };

/**
 * Sign-out honours the one answer the platform added so a client could tell.
 *
 * ADR-0017 §4: `POST /v1/auth/logout` answers **502** rather than 204 when
 * revocation fails, because a device still holds its tokens and a 204 would tell
 * it to delete a keychain entry for a session that is still live upstream. So
 * the screen must not navigate away on a failure — doing so would claim a
 * sign-out that did not happen, and strand a session nobody can reach.
 *
 * Before this was wired, the button called `router.replace('/(auth)/login')`
 * and never called `signOut()` at all, so the contract's whole point was unused.
 *
 * Nor does Settings navigate on a sign-out that succeeded (the owner's build 12
 * item 6): the root layout's guard shows the cover once the session is signed
 * out. These tests wait on the sign-out itself — its answer, the keychain — and
 * the move to the cover is the real-router project's to prove
 * (`__tests__/real-router/sign-out.test.tsx`): this project's router is a mock,
 * which is how build 8–12's `router.replace('/')` passed here while it was
 * dropped on the phone.
 */

beforeEach(() => {
  platformOperation.mockReset();
  routePlatform(platformOperation);
  kept.clear();
});

/** The real sign-out, watched: what it answered, once it has. */
function watchedSignOut() {
  const answers: { revoked: boolean }[] = [];
  const signOut = jest.fn(async () => {
    const answer = await signOutOfPlatform();
    answers.push(answer);
    return answer;
  });
  return { signOut, answers };
}

// Settings now reads the platform, so the screen only renders with a session.
// Before the fixtures were deleted an unconfigured session was enough.
function sessionWith(signOut: SessionContextValue['signOut']): SessionContextValue {
  return {
    status: 'signed-in',
    // The hook's members are stubbed (hence the cast); the platform's session is typed.
    session: {
      authenticated: true,
      user: { userId: 'u1', email: 'alex@acme.co', activeWorkspaceId: '00000000-0000-4000-8000-000000000001' },
      workspaces: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Acme', type: 'organization', role: 'owner' }],
    } satisfies Answer<'GET /v1/session'>,
    refresh: () => {},
    reload: async () => ({ status: 'signed-in' as const }),
    signIn: async () => ({ status: 'unconfigured', message: 'no backend in tests' }),
    signOut,
  } as unknown as SessionContextValue;
}

describe('Settings sign-out', () => {
  it("signs out and leaves the cover to the root guard: Settings navigates nowhere (24.11.6; the owner's build 12 item 6)", async () => {
    const signOut = jest.fn(async () => ({ revoked: true }));
    await renderWithProviders(<SettingsScreen />, sessionWith(signOut));

    await fireEvent.press(await screen.findByText('Sign out'));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    await expect(signOut.mock.results[0]!.value).resolves.toEqual({ revoked: true });
    // Inside the tabs "/" is Home: build 12's move to it was dropped.
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(screen.queryByTestId('action-failure')).toBeNull();
  });

  it('stays put and says so when revocation failed (502)', async () => {
    const signOut = jest.fn(async () => ({ revoked: false }));
    await renderWithProviders(<SettingsScreen />, sessionWith(signOut));

    await fireEvent.press(await screen.findByText('Sign out'));

    // The person is still signed in on this device, and the screen says both
    // halves of that: what did not happen, and that nothing was cleared.
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId('action-failure')).toBeTruthy();
    expect(screen.getByText(SIGN_OUT_FAILED)).toBeTruthy();
  });

  it('offers the action again, and clears the callout once it succeeds', async () => {
    const signOut = jest
      .fn<Promise<{ revoked: boolean }>, []>()
      .mockResolvedValueOnce({ revoked: false })
      .mockResolvedValueOnce({ revoked: true });
    await renderWithProviders(<SettingsScreen />, sessionWith(signOut));

    await fireEvent.press(await screen.findByText('Sign out'));
    expect(screen.getByTestId('action-failure')).toBeTruthy();

    await fireEvent.press(screen.getByText('Retry sign out'));
    expect(signOut).toHaveBeenCalledTimes(2);
    await expect(signOut.mock.results[1]!.value).resolves.toEqual({ revoked: true });
    await waitFor(() => expect(screen.queryByTestId('action-failure')).toBeNull());
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

/**
 * Sign-out lets go of this phone first (build 11, D8 — BUILD-PLAN 24.13.6).
 *
 * `DELETE /v1/session/devices/{deviceId}` needs the bearer the logout revokes,
 * so it goes BEFORE the logout, or the person who signed out keeps getting
 * this phone's pushes. It never blocks the sign-out and logs nothing when it
 * fails: the platform's own backstops take it from there. These run the real
 * sign-out — the device id and the session in a keychain, the transport mocked
 * at its boundary — through the screen's own button.
 */
describe('Sign-out unregisters this phone before the logout (build 11, D8)', () => {
  const DEVICE = '2f1c7a52-1d0e-4c83-9b5e-6c1a0d9f3e21';

  function signedInOnThisPhone(device: string | null) {
    kept.set('autom8x.access-token', 'access-1');
    kept.set('autom8x.refresh-token', 'refresh-1');
    kept.set('autom8x.access-expires-at', String(Date.now() + 3_600_000));
    if (device) kept.set('autom8x.device-id', device);
  }

  /** The sign-out's own calls, in order, with what each sent and whether the bearer was still kept. */
  function answerSignOut(device: () => unknown) {
    const sent: { call: string; init: { params?: { path?: Record<string, string> } }; bearerKept: boolean }[] = [];
    const routed = platformOperation.getMockImplementation();
    platformOperation.mockImplementation(async (path: string, execute: (clients: unknown, signal: AbortSignal) => Promise<{ data?: unknown }>) => {
      if (!path.startsWith('/v1/session/devices/') && path !== '/v1/auth/logout') return routed(path, execute);
      const send = (method: string) => async (template: string, init: { params?: { path?: Record<string, string> } }) => {
        sent.push({ call: `${method} ${template}`, init, bearerKept: kept.has('autom8x.access-token') });
        return { data: method === 'DELETE' ? device() : null, response: { ok: true } };
      };
      return (await execute({ platform: { DELETE: send('DELETE'), POST: send('POST') } }, new AbortController().signal)).data;
    });
    return sent;
  }

  it('sends DELETE for the device with the still-valid bearer BEFORE the logout, then clears it with the session', async () => {
    signedInOnThisPhone(DEVICE);
    const sent = answerSignOut(() => null);
    const { signOut, answers } = watchedSignOut();
    await renderWithProviders(<SettingsScreen />, sessionWith(signOut));

    await fireEvent.press(await screen.findByText('Sign out'));

    await waitFor(() => expect(answers).toEqual([{ revoked: true }]));
    expect(sent.map((entry) => entry.call)).toEqual([
      'DELETE /v1/session/devices/{deviceId}',
      'POST /v1/auth/logout',
    ]);
    expect(sent[0]!.init.params?.path).toEqual({ deviceId: DEVICE });
    expect(sent[0]!.bearerKept).toBe(true);
    // Gone with the session: the tokens and the device id alike.
    expect(kept.has('autom8x.device-id')).toBe(false);
    expect(kept.has('autom8x.access-token')).toBe(false);
  });

  it('never lets a failed DELETE block the sign-out, and logs nothing about it', async () => {
    signedInOnThisPhone(DEVICE);
    const sent = answerSignOut(() => {
      throw new PlatformError('Service Unavailable', 503);
    });
    const logged = (['log', 'info', 'warn', 'error'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined),
    );
    try {
      const { signOut, answers } = watchedSignOut();
      await renderWithProviders(<SettingsScreen />, sessionWith(signOut));
      await fireEvent.press(await screen.findByText('Sign out'));

      await waitFor(() => expect(answers).toEqual([{ revoked: true }]));
      expect(sent.map((entry) => entry.call)).toEqual([
        'DELETE /v1/session/devices/{deviceId}',
        'POST /v1/auth/logout',
      ]);
      expect(kept.has('autom8x.device-id')).toBe(false);
      expect(kept.has('autom8x.refresh-token')).toBe(false);
      expect(screen.queryByTestId('action-failure')).toBeNull();
      for (const spy of logged) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of logged) spy.mockRestore();
    }
  });

  it('sends only the logout when this phone never registered', async () => {
    signedInOnThisPhone(null);
    const sent = answerSignOut(() => null);
    const { signOut, answers } = watchedSignOut();
    await renderWithProviders(<SettingsScreen />, sessionWith(signOut));

    await fireEvent.press(await screen.findByText('Sign out'));

    await waitFor(() => expect(answers).toEqual([{ revoked: true }]));
    expect(sent.map((entry) => entry.call)).toEqual(['POST /v1/auth/logout']);
    expect(kept.has('autom8x.access-token')).toBe(false);
  });
});

/**
 * Sign-out and a push registration still in flight (the build 11 review).
 *
 * The signed-in tree registers a phone iOS already lets the app notify at every
 * sign-in and cold start. Sign out pressed while that PUT was still out read
 * the device id before it was answered — so no DELETE — and the answer then
 * wrote its id after the keychain was cleared: the phone stayed registered to
 * the person who signed out, and their pushes kept arriving. Sign-out now waits
 * for it, within five seconds, and one that answers after that keeps no id
 * (`lib/platform/devices.ts`). These run the real tree and the real sign-out.
 */
describe('Sign-out waits for a push registration still in flight (the build 11 review)', () => {
  const ANSWERED = '7b3e9d14-5c2a-4f86-a1d0-3e8f6b2c9a57';
  const GRANTED = { status: 'granted', granted: true, canAskAgain: true, expires: 'never' };
  const Notifications = jest.requireMock('expo-notifications');

  type Execute = (clients: unknown, signal: AbortSignal) => Promise<{ data?: unknown }>;
  type Init = { params?: { path?: { deviceId?: string } } };

  let permissionBefore: unknown;
  /** Answers the registration held by the test, if it is still out. */
  let release: () => void = () => undefined;

  /** The tree's registration held until the test answers it; then the sign-out's calls, in order. */
  function holdRegistration() {
    const sent: { call: string; deviceId?: string; bearerKept: boolean }[] = [];
    let answer: (deviceId: string) => void = () => undefined;
    const answered = new Promise<string>((resolve) => {
      answer = resolve;
    });
    release = () => answer(ANSWERED);
    const routed = platformOperation.getMockImplementation();
    platformOperation.mockImplementation(async (path: string, execute: Execute) => {
      if (!path.startsWith('/v1/session/devices') && path !== '/v1/auth/logout') return routed(path, execute);
      const send = (method: string) => async (template: string, init: Init) => {
        sent.push({ call: `${method} ${template}`, deviceId: init.params?.path?.deviceId, bearerKept: kept.has('autom8x.access-token') });
        return { data: method === 'PUT' ? { deviceId: await answered } : null, response: { ok: true } };
      };
      return (await execute({ platform: { PUT: send('PUT'), DELETE: send('DELETE'), POST: send('POST') } }, new AbortController().signal)).data;
    });
    return { sent, answer };
  }

  /** Signed in, nothing kept for push yet, and the tree's first registration out and unanswered. */
  async function signedInWithRegistrationOut() {
    kept.set('autom8x.access-token', 'access-1');
    kept.set('autom8x.refresh-token', 'refresh-1');
    kept.set('autom8x.access-expires-at', String(Date.now() + 3_600_000));
    const held = holdRegistration();
    const { signOut, answers } = watchedSignOut();
    await renderWithProviders(
      <>
        <TabLayout />
        <SettingsScreen />
      </>,
      sessionWith(signOut),
    );
    await waitFor(() => expect(held.sent.map((entry) => entry.call)).toEqual(['PUT /v1/session/devices']));
    return { ...held, answers };
  }

  beforeEach(() => {
    resetPushForTests();
    // An iPhone that already lets the app notify: the tree registers at sign-in.
    permissionBefore = Notifications.getPermissionsAsync.getMockImplementation();
    Notifications.getPermissionsAsync.mockImplementation(async () => GRANTED);
  });

  afterEach(() => {
    release();
    release = () => undefined;
    Notifications.getPermissionsAsync.mockImplementation(permissionBefore);
    resetPushForTests();
    jest.useRealTimers();
  });

  it('waits for a registration in flight when Sign out is pressed: the DELETE sends the id it answers, BEFORE the logout, then the keychain is cleared', async () => {
    const { sent, answer, answers } = await signedInWithRegistrationOut();

    await fireEvent.press(await screen.findByText('Sign out'));
    // Waiting for it: nothing else is sent while it is out, and the sign-out has not answered.
    expect(sent.map((entry) => entry.call)).toEqual(['PUT /v1/session/devices']);
    expect(answers).toEqual([]);

    await act(async () => answer(ANSWERED));
    await waitFor(() => expect(answers).toEqual([{ revoked: true }]));
    expect(sent.map((entry) => entry.call)).toEqual([
      'PUT /v1/session/devices',
      'DELETE /v1/session/devices/{deviceId}',
      'POST /v1/auth/logout',
    ]);
    // The id the registration answered, sent back with the still-valid bearer.
    expect(sent[1]!.deviceId).toBe(ANSWERED);
    expect(sent[1]!.bearerKept).toBe(true);
    expect(kept.has('autom8x.device-id')).toBe(false);
    expect(kept.has('autom8x.access-token')).toBe(false);
  });

  it('goes on after five seconds without a registration that has not answered: the logout is sent, and when it answers later no device id is kept', async () => {
    jest.useFakeTimers();
    const { sent, answer, answers } = await signedInWithRegistrationOut();

    await fireEvent.press(await screen.findByText('Sign out'));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(4_999);
    });
    // Still waiting, and still signed in: nothing sent but the registration.
    expect(sent.map((entry) => entry.call)).toEqual(['PUT /v1/session/devices']);
    expect(answers).toEqual([]);
    expect(kept.has('autom8x.refresh-token')).toBe(true);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    await waitFor(() => expect(answers).toEqual([{ revoked: true }]));
    // Five seconds, then on: the logout — with no id kept, nothing to DELETE.
    expect(sent.map((entry) => entry.call)).toEqual(['PUT /v1/session/devices', 'POST /v1/auth/logout']);
    expect(kept.has('autom8x.access-token')).toBe(false);

    // It answers after all: its id is not written for a session that has ended.
    await act(async () => answer(ANSWERED));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(kept.has('autom8x.device-id')).toBe(false);
    expect([...kept.values()]).not.toContain(ANSWERED);
  });
});
