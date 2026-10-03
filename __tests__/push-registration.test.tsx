import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { CodedError } from 'expo-modules-core';

import TabLayout from '@/app/(tabs)/_layout';
import NotificationsScreen from '@/app/(tabs)/(home)/notifications';
import NotificationSettingsScreen from '@/app/(tabs)/settings/notifications';
import { resetPushForTests } from '@/hooks/use-push-registration';
import {
  SessionContext,
  activeWorkspaceId,
  useSession,
  type SessionContextValue,
  type SessionReloadOutcome,
} from '@/hooks/use-session';
import { PlatformError } from '@/lib/platform/problem';
import { TEST_WORKSPACE, flowCatalogPayload, routePlatform, signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

/**
 * Device push (build 11, D8 — BUILD-PLAN 24.13.6, ADR-0035; the owner's build
 * 10 item 13).
 *
 * The decisions these hold: push for held and failed runs; the inbox card is
 * the only ask and nothing is asked at launch; "Not now" holds for the
 * session, as the Face ID offer's answer does; iOS phones only — Android and a
 * simulator register nothing in build 11, and the card says so. The transport
 * is mocked at its boundary and the devices route's own request is built by
 * the real `lib/platform/devices.ts`, so the PUT's path and body are the
 * ones the platform would receive.
 */

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));
const { platformOperation, newIdempotencyKey } = jest.requireMock('@/lib/platform/client');

const PROJECT_ID = 'cb806193-8885-4b5c-b1d6-850da3f162a2';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'cb806193-8885-4b5c-b1d6-850da3f162a2' } } },
    platform: { ios: { buildNumber: '11' } },
  },
}));

// A keychain that keeps what it is given: the device id, and "Not now".
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
const { kept, getItemAsync } = jest.requireMock('expo-secure-store') as {
  kept: Map<string, string>;
  getItemAsync: jest.Mock;
};

const Notifications = jest.requireMock('expo-notifications');
const Device = jest.requireMock('expo-device') as { isDevice: boolean };

const TOKEN = 'ExponentPushToken[test-device]';
const DEVICE_ID = '2f1c7a52-1d0e-4c83-9b5e-6c1a0d9f3e21';
const UNDETERMINED = { status: 'undetermined', granted: false, canAskAgain: true, expires: 'never' };
const GRANTED = { status: 'granted', granted: true, canAskAgain: true, expires: 'never' };
const DENIED = { status: 'denied', granted: false, canAskAgain: false, expires: 'never' };

type Execute = (clients: unknown, signal: AbortSignal) => Promise<{ data?: unknown }>;

/** What the devices route was sent, in order. */
const deviceCalls: { call: string; body?: unknown; deviceId?: string }[] = [];
/** How the devices route answers; a throw is the platform refusing. */
let deviceAnswer: () => unknown;
const puts = () => deviceCalls.filter((entry) => entry.call === 'PUT /v1/session/devices');

function route(overrides: Record<string, unknown> = {}) {
  routePlatform(platformOperation, { '/automations': flowCatalogPayload(), ...overrides });
  const routed = platformOperation.getMockImplementation();
  platformOperation.mockImplementation(async (path: string, execute: Execute) => {
    if (!path.startsWith('/v1/session/devices')) return routed(path, execute);
    const send =
      (method: string) =>
      async (template: string, init: { body?: unknown; params?: { path?: { deviceId?: string } } }) => {
        deviceCalls.push({ call: `${method} ${template}`, body: init.body, deviceId: init.params?.path?.deviceId });
        return { data: deviceAnswer(), response: { ok: true } };
      };
    return (await execute({ platform: { PUT: send('PUT'), DELETE: send('DELETE') } }, new AbortController().signal))
      .data;
  });
}

function sessionIn(status: 'restoring' | 'signed-out'): SessionContextValue {
  return { ...signedInSession, status } as unknown as SessionContextValue;
}

/** A tap on a push, as expo-notifications hands it over. */
function tap(identifier: string, data: Record<string, unknown>) {
  return {
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: { date: 0, request: { identifier, content: { title: 'Autom8x', data }, trigger: null } },
  };
}

/** Let every answer already on its way land. */
const settle = () => act(async () => {});

beforeEach(() => {
  resetPushForTests();
  kept.clear();
  deviceCalls.length = 0;
  deviceAnswer = () => ({ deviceId: DEVICE_ID });
  platformOperation.mockReset();
  route();
  Notifications.getPermissionsAsync.mockImplementation(async () => UNDETERMINED);
  Notifications.requestPermissionsAsync.mockImplementation(async () => GRANTED);
  Notifications.getExpoPushTokenAsync.mockImplementation(async () => ({ type: 'expo', data: TOKEN }));
  Notifications.getLastNotificationResponseAsync.mockImplementation(async () => null);
});

describe('Device push: the ask, never at launch (build 11, D8)', () => {
  it('asks nothing and registers nothing at launch: signed in, the tree only reads what iOS already allows', async () => {
    await renderWithProviders(
      <>
        <TabLayout />
        <NotificationsScreen />
      </>,
      signedInSession,
    );
    // The inbox's card is the ask — and drawing it asks nothing either.
    expect(await screen.findByText('Turn on')).toBeTruthy();
    await settle();
    expect(Notifications.getPermissionsAsync).toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(deviceCalls).toEqual([]);
  });

  it('Turn on asks iOS at the tap, then registers this phone — PUT { platform, token, appBuild } — keeps only the device id, and the card goes', async () => {
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(await screen.findByText('Get a notification on this phone when a run is held or fails.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Turn on'));

    await waitFor(() => expect(screen.queryByTestId('push-card')).toBeNull());
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: PROJECT_ID });
    expect(deviceCalls).toEqual([
      { call: 'PUT /v1/session/devices', body: { platform: 'ios', token: TOKEN, appBuild: '1.0.0 (11)' } },
    ]);
    expect(kept.get('autom8x.device-id')).toBe(DEVICE_ID);
    // The token went to the platform in that body and nowhere else.
    expect([...kept.values()]).not.toContain(TOKEN);
    expect(screen.queryByText(TOKEN)).toBeNull();
  });

  it('already allowed: no card, and the signed-in tree and the card register once between them', async () => {
    Notifications.getPermissionsAsync.mockImplementation(async () => GRANTED);
    await renderWithProviders(
      <>
        <TabLayout />
        <NotificationsScreen />
      </>,
      signedInSession,
    );
    expect(await screen.findByText('Run failed')).toBeTruthy();
    // Both have read what iOS allows: the tree at sign-in, the card when drawn.
    await waitFor(() => expect(Notifications.getPermissionsAsync).toHaveBeenCalledTimes(2));
    await settle();

    expect(puts()).toHaveLength(1);
    expect(screen.queryByTestId('push-card')).toBeNull();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('off in iOS Settings: the card says so and opens Settings, and back with notifications on it registers and goes', async () => {
    Notifications.getPermissionsAsync.mockImplementation(async () => DENIED);
    // Both are react-native's own jest mocks: their implementations are put back
    // as they were, since restoring a spy on a mock would leave it answering
    // nothing for the tests after this one.
    const openSettings = Linking.openSettings as unknown as jest.Mock;
    const listen = AppState.addEventListener as unknown as jest.Mock;
    const [openedBefore, listenedBefore] = [openSettings.getMockImplementation(), listen.getMockImplementation()];
    openSettings.mockImplementation(async () => undefined);
    const returned: ((state: string) => void)[] = [];
    listen.mockImplementation((_type: string, handler: (state: string) => void) => {
      returned.push(handler);
      return { remove: () => undefined };
    });
    try {
      await renderWithProviders(<NotificationsScreen />, signedInSession);
      expect(await screen.findByText('Notifications for Autom8x are off in iOS Settings.')).toBeTruthy();
      expect(screen.queryByText('Turn on')).toBeNull();

      await fireEvent.press(screen.getByText('Open Settings'));
      expect(openSettings).toHaveBeenCalledTimes(1);
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();

      Notifications.getPermissionsAsync.mockImplementation(async () => GRANTED);
      await act(async () => {
        for (const handler of returned) handler('active');
      });
      await waitFor(() => expect(puts()).toHaveLength(1));
      await waitFor(() => expect(screen.queryByTestId('push-card')).toBeNull());
    } finally {
      openSettings.mockImplementation(openedBefore);
      listen.mockImplementation(listenedBefore);
    }
  });

  it('"Not now" holds for the session: gone from both inboxes, still gone at the next launch, and nothing asked', async () => {
    const home = await renderWithProviders(<NotificationsScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Not now'));
    expect(screen.queryByTestId('push-card')).toBeNull();
    expect(kept.get('autom8x.push-not-now')).toBe('true');
    await home.unmount();

    // Settings' copy of the inbox, in the same process: not asked again.
    const settings = await renderWithProviders(<NotificationSettingsScreen />, signedInSession);
    expect(await screen.findByText('Run failed')).toBeTruthy();
    await settle();
    expect(screen.queryByTestId('push-card')).toBeNull();
    await settings.unmount();

    // The next launch reads the keychain afresh (cleared only with the session).
    resetPushForTests();
    getItemAsync.mockClear();
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(await screen.findByText('Run failed')).toBeTruthy();
    await waitFor(() =>
      expect(getItemAsync).toHaveBeenCalledWith('autom8x.push-not-now', expect.anything()),
    );
    await settle();
    expect(screen.queryByTestId('push-card')).toBeNull();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('Device push: the ask on an empty inbox too (the owner, build 11, 2026-10-03)', () => {
  /** An inbox with nothing held and nothing failed. */
  const EMPTY = { '/approvals': { approvals: [] }, '/runs': { runs: [] } };
  /** Every line a person reads, top to bottom. */
  const asRead = () => screen.getAllByText(/./).map((node) => String(node.props.children));

  beforeEach(() => {
    platformOperation.mockReset();
    route(EMPTY);
  });

  it('asks above "Quiet, as designed" on both inboxes, and Turn on registers there — else push could not be turned on at all', async () => {
    for (const Screen of [NotificationsScreen, NotificationSettingsScreen]) {
      resetPushForTests();
      deviceCalls.length = 0;
      const view = await renderWithProviders(<Screen />, signedInSession);
      expect(await screen.findByText('Quiet, as designed')).toBeTruthy();
      expect(await screen.findByTestId('push-card')).toBeTruthy();
      // The ask is drawn above the empty standard, which keeps its way back.
      const lines = asRead();
      expect(lines.indexOf('Know the moment something needs you')).toBeGreaterThanOrEqual(0);
      expect(lines.indexOf('Know the moment something needs you')).toBeLessThan(lines.indexOf('Quiet, as designed'));
      expect(screen.getByLabelText('Back')).toBeTruthy();

      await fireEvent.press(screen.getByText('Turn on'));
      await waitFor(() => expect(screen.queryByTestId('push-card')).toBeNull());
      expect(puts()).toHaveLength(1);
      // Registered, the empty standard is all that is left.
      expect(screen.getByText('Quiet, as designed')).toBeTruthy();
      await view.unmount();
    }
  });

  it('"Not now" on an empty inbox takes the ask away and leaves the empty standard whole', async () => {
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Not now'));
    expect(screen.queryByTestId('push-card')).toBeNull();
    expect(screen.getByText('Quiet, as designed')).toBeTruthy();
    expect(screen.getByText('We only notify you for held runs and failures. Nothing needs you right now.')).toBeTruthy();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(deviceCalls).toEqual([]);
  });

  it('already allowed, an empty inbox shows no ask — only the empty standard', async () => {
    Notifications.getPermissionsAsync.mockImplementation(async () => GRANTED);
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(await screen.findByText('Quiet, as designed')).toBeTruthy();
    await waitFor(() => expect(puts()).toHaveLength(1));
    await settle();
    expect(screen.queryByTestId('push-card')).toBeNull();
  });
});

describe('Device push: why a phone cannot be asked, in words (build 11, D8)', () => {
  it('Android and a simulator register nothing, and the card says why — with nothing to turn on', async () => {
    Notifications.getPermissionsAsync.mockImplementation(async () => GRANTED);
    const phones = [
      () => jest.replaceProperty(Platform, 'OS', 'android'),
      () => jest.replaceProperty(Device, 'isDevice', false),
    ];
    for (const replace of phones) {
      resetPushForTests();
      const replaced = replace();
      try {
        const view = await renderWithProviders(
          <>
            <TabLayout />
            <NotificationsScreen />
          </>,
          signedInSession,
        );
        expect(await screen.findByText('Notifications on this phone are coming in a later build.')).toBeTruthy();
        expect(screen.queryByText('Turn on')).toBeNull();
        expect(screen.getByText('Not now')).toBeTruthy();
        await settle();
        await view.unmount();
      } finally {
        replaced.restore();
      }
    }
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(deviceCalls).toEqual([]);
  });

  it('a platform from before the devices route — 404 or 503 — is "not available yet", in words, never a problem title', async () => {
    const refusals = [
      new PlatformError('Not Found', 404, 'NOT_FOUND', { method: 'PUT', path: '/v1/session/devices' }),
      new PlatformError('Service Unavailable', 503, 'NOT_CONFIGURED'),
    ];
    for (const refusal of refusals) {
      resetPushForTests();
      deviceAnswer = () => {
        throw refusal;
      };
      const view = await renderWithProviders(<NotificationsScreen />, signedInSession);
      await fireEvent.press(await screen.findByText('Turn on'));

      expect(await screen.findByText("Notifications aren't available yet.")).toBeTruthy();
      expect(screen.queryByText(refusal.message)).toBeNull();
      expect(screen.queryByText('Turn on')).toBeNull();
      await view.unmount();
    }
    expect(puts()).toHaveLength(2);
  });

  it('a build with no push token says so, and sends nothing', async () => {
    Notifications.getExpoPushTokenAsync.mockImplementation(async () => {
      throw new Error('no valid "aps-environment" entitlement string found for application');
    });
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Turn on'));

    expect(await screen.findByText("Notifications aren't available on this build.")).toBeTruthy();
    expect(screen.queryByText(/aps-environment/u)).toBeNull();
    expect(deviceCalls).toEqual([]);
  });

  it('a token service that is offline or failing asks again, in words, with Turn on — never "not on this build" — and a second Turn on registers (the build 11 review)', async () => {
    // As expo-notifications 0.32 throws them from getExpoPushTokenAsync: CodedErrors, by code.
    const failures = [
      ['ERR_NOTIFICATIONS_NETWORK_ERROR', 'Error encountered while fetching Expo token: TypeError: Network request failed.'],
      ['ERR_NOTIFICATIONS_SERVER_ERROR', 'Error encountered while fetching Expo token, expected an OK response, received: 503 (body: "").'],
    ] as const;
    for (const [code, message] of failures) {
      resetPushForTests();
      deviceCalls.length = 0;
      Notifications.getExpoPushTokenAsync.mockImplementation(async () => {
        throw new CodedError(code, message);
      });
      const view = await renderWithProviders(<NotificationsScreen />, signedInSession);
      await fireEvent.press(await screen.findByText('Turn on'));

      expect(await screen.findByText("Notifications couldn't be turned on. Try again.")).toBeTruthy();
      expect(screen.getByText('Turn on')).toBeTruthy();
      expect(screen.queryByText("Notifications aren't available on this build.")).toBeNull();
      expect(screen.queryByText(message)).toBeNull();
      expect(deviceCalls).toEqual([]);

      // The service back: a second Turn on registers, and the card goes.
      Notifications.getExpoPushTokenAsync.mockImplementation(async () => ({ type: 'expo', data: TOKEN }));
      await fireEvent.press(screen.getByText('Turn on'));
      await waitFor(() => expect(screen.queryByTestId('push-card')).toBeNull());
      expect(puts()).toHaveLength(1);
      await view.unmount();
    }
  });

  it('any other failed registration asks again, in words, and a second Turn on registers', async () => {
    deviceAnswer = () => {
      throw new PlatformError('Bad Gateway', 502);
    };
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Turn on'));

    expect(await screen.findByText("Notifications couldn't be turned on. Try again.")).toBeTruthy();
    expect(screen.queryByText('Bad Gateway')).toBeNull();

    deviceAnswer = () => ({ deviceId: DEVICE_ID });
    await fireEvent.press(screen.getByText('Turn on'));
    await waitFor(() => expect(screen.queryByTestId('push-card')).toBeNull());
    expect(puts()).toHaveLength(2);
  });
});

describe('Device push: the signed-in tree (build 11, D8)', () => {
  it('registers again when the token changes — the first token heard is a registration’s own echo', async () => {
    Notifications.getPermissionsAsync.mockImplementation(async () => GRANTED);
    await renderWithProviders(<TabLayout />, signedInSession);
    await waitFor(() => expect(puts()).toHaveLength(1));
    const heard = Notifications.addPushTokenListener.mock.calls[0][0];

    await act(async () => heard({ type: 'ios', data: 'apns-token-1' }));
    expect(puts()).toHaveLength(1);

    await act(async () => heard({ type: 'ios', data: 'apns-token-2' }));
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenLastCalledWith({
      projectId: PROJECT_ID,
      devicePushToken: { type: 'ios', data: 'apns-token-2' },
    });

    await act(async () => heard({ type: 'ios', data: 'apns-token-2' }));
    expect(puts()).toHaveLength(2);
  });

  it('a tap while the app runs opens what it names: a failed run’s page, or Activity for a held one', async () => {
    await renderWithProviders(<TabLayout />, signedInSession);
    await waitFor(() => expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalled());
    const opened = Notifications.addNotificationResponseReceivedListener.mock.calls[0][0];

    await act(async () => opened(tap('n-1', { event: 'run-failed', runId: 'run-7' })));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/(tabs)/(home)/run', params: { runId: 'run-7' } });

    await act(async () => opened(tap('n-2', { event: 'approval-requested', runId: 'run-8', approvalId: 'apr-8' })));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/(tabs)/activity');

    // One tap opens one screen; a run id that is not an id opens nothing.
    await act(async () => opened(tap('n-2', { event: 'approval-requested', runId: 'run-8', approvalId: 'apr-8' })));
    await act(async () => opened(tap('n-3', { event: 'run-failed', runId: '../settings?next=1' })));
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
  });

  it('the tap that opened the app opens its screen once signed in, and not before', async () => {
    const cold = [
      [tap('n-cold-1', { event: 'run-failed', runId: 'run-9' }), { pathname: '/(tabs)/(home)/run', params: { runId: 'run-9' } }],
      [tap('n-cold-2', { event: 'approval-requested', runId: 'run-10', approvalId: 'apr-10' }), '/(tabs)/activity'],
    ] as const;
    for (const [response, target] of cold) {
      resetPushForTests();
      mockRouter.push.mockClear();
      Notifications.getLastNotificationResponseAsync.mockClear();
      Notifications.getLastNotificationResponseAsync.mockImplementation(async () => response);

      const restoring = await renderWithProviders(<TabLayout />, sessionIn('restoring'));
      await settle();
      expect(Notifications.getLastNotificationResponseAsync).not.toHaveBeenCalled();
      expect(mockRouter.push).not.toHaveBeenCalled();
      await restoring.unmount();

      const signedIn = await renderWithProviders(<TabLayout />, signedInSession);
      await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(target));
      expect(mockRouter.push).toHaveBeenCalledTimes(1);
      await signedIn.unmount();
    }
  });

  it('shows a push’s banner while the app is open, and only while someone is signed in', async () => {
    const view = await renderWithProviders(<TabLayout />, signedInSession);
    const handler = Notifications.setNotificationHandler.mock.calls[0][0];
    await expect(handler.handleNotification()).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
    await view.unmount();
    expect(Notifications.setNotificationHandler).toHaveBeenLastCalledWith(null);

    Notifications.setNotificationHandler.mockClear();
    await renderWithProviders(<TabLayout />, sessionIn('signed-out'));
    expect(Notifications.setNotificationHandler).not.toHaveBeenCalled();
  });
});

describe('Device push: a tap opens in its own workspace (build 11)', () => {
  /** Another of the person's workspaces, and one that is not theirs — both as the platform writes ids. */
  const OTHER = '5d0f3a8e-2c41-4b7a-9e15-0a6c3f2b7d94';
  const NOT_THEIRS = '9e8d7c6b-5a49-4382-a716-f5e4d3c2b1a0';
  /** A workspace the session lists under an id of another shape: never one a push may switch to. */
  const SLUG = 'acme-ops';
  const RUN = { pathname: '/(tabs)/(home)/run', params: { runId: 'run-7' } };

  /** What happened, in order: the switch sent, the session read again, a screen opened. */
  let events: string[] = [];
  /** The switches the platform was sent: the workspace and the idempotency key. */
  let switches: { workspaceId: unknown; key?: string }[] = [];
  /** How the platform answers a switch; a throw is its refusal. */
  let switchAnswer: () => unknown;
  /** How a session read ends; `signed-in` adopts what the platform has active. */
  let reloadAnswer: () => SessionReloadOutcome;
  /** The workspace the platform's session has active: what a switch sets and a read adopts. */
  let platformActive = TEST_WORKSPACE;
  /** The active workspace of the session the tree last drew — the one a screen opened now binds to. */
  let drawnActive: string | null = null;
  /** The drawn workspace at each opening. */
  let openedIn: (string | null)[] = [];

  /** Signed in, with the person's two workspaces, this one active. */
  function activeIn(workspaceId: string, reload: SessionContextValue['reload']): SessionContextValue {
    if (signedInSession.status !== 'signed-in') throw new Error('fixture');
    return {
      ...signedInSession,
      reload,
      session: {
        ...signedInSession.session,
        user: { ...signedInSession.session.user, activeWorkspaceId: workspaceId },
        workspaces: [
          ...signedInSession.session.workspaces,
          { id: OTHER, name: 'Northwind', type: 'organization', role: 'owner' },
          { id: SLUG, name: 'Acme Ops', type: 'organization', role: 'owner' },
        ],
      },
    } as SessionContextValue;
  }

  /** Notes the active workspace of every session the tree commits. */
  function Drawn() {
    const active = activeWorkspaceId(useSession());
    useLayoutEffect(() => {
      drawnActive = active;
    }, [active]);
    return null;
  }

  /** The signed-in tree, over a session that is read again as the provider's is. */
  function Switchable() {
    const [active, setActive] = useState(TEST_WORKSPACE);
    const reload = useCallback(async () => {
      events.push('reload');
      const outcome = reloadAnswer();
      if (outcome.status === 'signed-in') setActive(platformActive);
      return outcome;
    }, []);
    const session = useMemo(() => activeIn(active, reload), [active, reload]);
    return (
      <SessionContext.Provider value={session}>
        <Drawn />
        <TabLayout />
      </SessionContext.Provider>
    );
  }

  beforeEach(() => {
    events = [];
    switches = [];
    openedIn = [];
    platformActive = TEST_WORKSPACE;
    drawnActive = null;
    switchAnswer = () => ({ activeWorkspaceId: OTHER });
    reloadAnswer = () => ({ status: 'signed-in' });
    mockRouter.push.mockImplementation(() => {
      events.push('open');
      openedIn.push(drawnActive);
    });
    const routed = platformOperation.getMockImplementation();
    platformOperation.mockImplementation(async (path: string, execute: Execute) => {
      if (path !== '/v1/session/active-workspace') return routed(path, execute);
      const PATCH = async (
        _template: string,
        init: { body: { workspaceId: string }; params: { header: Record<string, string> } },
      ) => {
        events.push('switch');
        switches.push({ workspaceId: init.body.workspaceId, key: init.params.header['Idempotency-Key'] });
        const answer = switchAnswer();
        platformActive = init.body.workspaceId;
        return { data: answer, response: { ok: true } };
      };
      return (await execute({ platform: { PATCH } }, new AbortController().signal)).data;
    });
  });

  afterEach(() => {
    mockRouter.push.mockReset();
  });

  /** The tree, signed in, and the tap listener it set up. */
  async function signedInTree() {
    const view = await renderWithProviders(<Switchable />, signedInSession);
    await waitFor(() => expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalled());
    return { view, opened: Notifications.addNotificationResponseReceivedListener.mock.calls[0][0] };
  }

  it('switches to another of the person’s workspaces as the switcher does — the switch, then the session read — and opens the run there once that session is drawn', async () => {
    const { opened } = await signedInTree();
    expect(drawnActive).toBe(TEST_WORKSPACE);

    await act(async () => opened(tap('n-ws-1', { event: 'run-failed', workspaceId: OTHER, runId: 'run-7' })));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(RUN));

    expect(switches).toEqual([{ workspaceId: OTHER, key: 'test-intent' }]);
    expect(newIdempotencyKey).toHaveBeenCalledWith('workspace-activate');
    expect(events).toEqual(['switch', 'reload', 'open']);
    // Opened in the switched session, so the run's page binds to the push's workspace.
    expect(openedIn).toEqual([OTHER]);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('switches the same way for a held run, then opens Activity', async () => {
    const { opened } = await signedInTree();

    await act(async () =>
      opened(tap('n-ws-2', { event: 'approval-requested', workspaceId: OTHER, runId: 'run-8', approvalId: 'apr-8' })),
    );
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/activity'));

    expect(switches).toEqual([{ workspaceId: OTHER, key: 'test-intent' }]);
    expect(events).toEqual(['switch', 'reload', 'open']);
    expect(openedIn).toEqual([OTHER]);
  });

  it('opens at once, with no switch, when the push names the active workspace', async () => {
    const { opened } = await signedInTree();

    await act(async () => opened(tap('n-ws-3', { event: 'run-failed', workspaceId: TEST_WORKSPACE, runId: 'run-7' })));
    expect(mockRouter.push).toHaveBeenCalledWith(RUN);
    await settle();

    expect(switches).toEqual([]);
    expect(events).toEqual(['open']);
    expect(openedIn).toEqual([TEST_WORKSPACE]);
  });

  it('opens in the active workspace, as before, when the push names none, one not theirs, or an id of another shape', async () => {
    const { opened } = await signedInTree();
    const named = [undefined, NOT_THEIRS, SLUG, `${OTHER}/../settings`, OTHER.toUpperCase().replace(/-/gu, ''), 42];

    for (const [index, workspaceId] of named.entries()) {
      await act(async () =>
        opened(tap(`n-ws-4-${index}`, { event: 'run-failed', runId: 'run-7', ...(workspaceId === undefined ? {} : { workspaceId }) })),
      );
    }
    await settle();

    expect(mockRouter.push).toHaveBeenCalledTimes(named.length);
    expect(openedIn).toEqual(named.map(() => TEST_WORKSPACE));
    expect(switches).toEqual([]);
    expect(events.includes('reload')).toBe(false);
  });

  it('opens nothing when the platform refuses the switch, or the session cannot be read again — the person stays where they are', async () => {
    // The switch refused: no session read, nothing opened.
    switchAnswer = () => {
      throw new PlatformError('Forbidden', 403);
    };
    const refused = await signedInTree();
    await act(async () => refused.opened(tap('n-ws-5', { event: 'run-failed', workspaceId: OTHER, runId: 'run-7' })));
    await settle();
    expect(switches).toEqual([{ workspaceId: OTHER, key: 'test-intent' }]);
    expect(events).toEqual(['switch']);
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(drawnActive).toBe(TEST_WORKSPACE);
    await refused.view.unmount();

    // Switched, but the session read failed: the tree still draws the workspace
    // it was in, and nothing opens into it.
    resetPushForTests();
    Notifications.addNotificationResponseReceivedListener.mockClear();
    events = [];
    switchAnswer = () => ({ activeWorkspaceId: OTHER });
    reloadAnswer = () => ({ status: 'unavailable', message: 'The platform could not be reached.' });
    const unread = await signedInTree();
    await act(async () =>
      unread.opened(tap('n-ws-6', { event: 'approval-requested', workspaceId: OTHER, runId: 'run-8', approvalId: 'apr-8' })),
    );
    await settle();
    expect(events).toEqual(['switch', 'reload']);
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(drawnActive).toBe(TEST_WORKSPACE);
  });

  it('switches and opens once for one tap, though it is heard twice — as it arrives and as the tap that opened the app', async () => {
    const response = tap('n-ws-7', { event: 'run-failed', workspaceId: OTHER, runId: 'run-7' });
    Notifications.getLastNotificationResponseAsync.mockImplementation(async () => response);
    const { opened } = await signedInTree();
    await act(async () => opened(response));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(RUN));
    await settle();

    expect(switches).toHaveLength(1);
    expect(events).toEqual(['switch', 'reload', 'open']);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('the tap that opened the app switches to its workspace once signed in, and not before', async () => {
    Notifications.getLastNotificationResponseAsync.mockImplementation(async () =>
      tap('n-ws-cold', { event: 'run-failed', workspaceId: OTHER, runId: 'run-7' }),
    );
    const restoring = await renderWithProviders(<TabLayout />, sessionIn('restoring'));
    await settle();
    expect(Notifications.getLastNotificationResponseAsync).not.toHaveBeenCalled();
    expect(switches).toEqual([]);
    await restoring.unmount();

    await renderWithProviders(<Switchable />, signedInSession);
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(RUN));
    expect(events).toEqual(['switch', 'reload', 'open']);
    expect(openedIn).toEqual([OTHER]);
  });
});
