import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Platform } from 'react-native';

import NotificationsOfferScreen from '@/app/(auth)/notifications-offer';
import { offersPushAsk, resetPushForTests } from '@/hooks/use-push-registration';
import { nextAfterSignIn, resetReturnForTests } from '@/lib/view/return-to';
import { signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/session-store', () => ({
  ...jest.requireActual('@/lib/platform/session-store'),
  readPushNotNow: jest.fn(async () => false),
  writePushNotNow: jest.fn(async () => undefined),
}));
const { readPushNotNow, writePushNotNow } = jest.requireMock('@/lib/platform/session-store');
const Notifications = jest.requireMock('expo-notifications') as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
};

/**
 * The notifications offer after a sign-in (round 24 P8; the owner's build 23
 * F6: "Just like that it should be notifications allow").
 */
beforeEach(() => {
  resetPushForTests();
  resetReturnForTests();
  readPushNotNow.mockResolvedValue(false);
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined', granted: false, canAskAgain: true, expires: 'never' });
});

describe('the notifications offer screen', () => {
  it('asks in the Face ID offer’s layout: the bell, the question, one line, Turn on and Not now', async () => {
    await renderWithProviders(<NotificationsOfferScreen />, signedInSession);
    expect(screen.getByTestId('notifications-offer')).toBeTruthy();
    expect(screen.getByText('Turn on notifications')).toBeTruthy();
    expect(screen.getByText('Know when a run needs your approval or something goes wrong.')).toBeTruthy();
    expect(screen.getByText('Turn on')).toBeTruthy();
    expect(screen.getByText('Not now')).toBeTruthy();
  });

  it('Turn on asks iOS at the tap, then opens the app', async () => {
    await renderWithProviders(<NotificationsOfferScreen />, signedInSession);
    await fireEvent.press(screen.getByText('Turn on'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/(home)', { withAnchor: true }));
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(writePushNotNow).not.toHaveBeenCalled();
  });

  it('Not now is kept and opens the app without asking iOS', async () => {
    await renderWithProviders(<NotificationsOfferScreen />, signedInSession);
    await fireEvent.press(screen.getByText('Not now'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/(home)', { withAnchor: true }));
    expect(writePushNotNow).toHaveBeenCalledTimes(1);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    // This session's Not now: not offered again.
    await expect(offersPushAsk()).resolves.toBe(false);
  });
});

describe('offersPushAsk: only where iOS can still ask and no Not now was said', () => {
  it('an iPhone iOS has not asked: offered', async () => {
    await expect(offersPushAsk()).resolves.toBe(true);
  });

  it.each([
    ['iOS allows already', { status: 'granted', granted: true, canAskAgain: true, expires: 'never' }],
    ['iOS said no', { status: 'denied', granted: false, canAskAgain: false, expires: 'never' }],
  ])('%s: not offered', async (_name, answer) => {
    Notifications.getPermissionsAsync.mockResolvedValue(answer);
    await expect(offersPushAsk()).resolves.toBe(false);
  });

  it('a Not now kept on this phone: not offered', async () => {
    readPushNotNow.mockResolvedValue(true);
    await expect(offersPushAsk()).resolves.toBe(false);
  });

  it('Android (no push in this build): not offered', async () => {
    const android = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      await expect(offersPushAsk()).resolves.toBe(false);
    } finally {
      android.restore();
    }
  });
});

describe('nextAfterSignIn: Face ID, then notifications, then the app', () => {
  it.each([
    ['login', { faceId: true, notifications: true }, '/(auth)/faceid-offer'],
    ['login', { faceId: false, notifications: true }, '/(auth)/notifications-offer'],
    ['login', { faceId: false, notifications: false }, '/(tabs)/(home)'],
    ['faceid-offer', { faceId: true, notifications: true }, '/(auth)/notifications-offer'],
    ['faceid-offer', { faceId: false, notifications: false }, '/(tabs)/(home)'],
    ['notifications-offer', { faceId: true, notifications: true }, '/(tabs)/(home)'],
  ] as const)('from %s with %j: %s', (from, offers, href) => {
    const next = nextAfterSignIn(from, offers);
    expect(next.href).toBe(href);
    expect(next.options).toEqual(href === '/(tabs)/(home)' ? { withAnchor: true } : undefined);
  });
});
