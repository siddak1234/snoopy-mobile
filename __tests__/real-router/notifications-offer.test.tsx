import * as LocalAuthentication from 'expo-local-authentication';
import { screen } from 'expo-router/testing-library';

import { offersPushAsk } from '@/hooks/use-push-registration';
import { answerPlatform, asInProduction, kept, launch, press } from '@/test/real-router';

/**
 * The notifications offer after a sign-in (round 24 P8; the owner's build 23
 * F6: "initially when logging into the app we see face id allow. Just like
 * that it should be notifications allow"), under the REAL router: after the
 * Face ID offer where that is asked, only where iOS can still ask, and once.
 */

jest.setTimeout(90_000);

const Notifications = jest.requireMock('expo-notifications') as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
};
const Biometrics = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;

/** iOS has not asked this app yet. */
function notAskedYet() {
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined', granted: false, canAskAgain: true, expires: 'never' });
}

let biometrics: [unknown, unknown];
beforeEach(() => {
  biometrics = [Biometrics.hasHardwareAsync.getMockImplementation(), Biometrics.isEnrolledAsync.getMockImplementation()];
});
afterEach(() => {
  Biometrics.hasHardwareAsync.mockImplementation(biometrics[0] as never);
  Biometrics.isEnrolledAsync.mockImplementation(biometrics[1] as never);
  jest.restoreAllMocks();
});

async function signIn() {
  await asInProduction(async () => {
    await press('Get started');
    await press('Sign in with Google');
  });
}

it('iOS not asked yet: the sign-in shows Turn on notifications; Not now opens Home and is kept, so it is not offered again', async () => {
  kept.clear();
  notAskedYet();
  answerPlatform();
  const view = await launch();
  await signIn();

  expect(view.getSegments()).toEqual(['(auth)', 'notifications-offer']);
  expect(screen.getByText('Turn on notifications')).toBeTruthy();
  expect(screen.getByText('Know when a run needs your approval or something goes wrong.')).toBeTruthy();

  await asInProduction(async () => {
    await press('Not now');
  });
  expect([view.getPathname(), view.getSegments()]).toEqual(['/', ['(tabs)', '(home)']]);
  expect(kept.get('autom8x.push-not-now')).toBeTruthy();
  await expect(offersPushAsk()).resolves.toBe(false);
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});

it('Turn on is iOS’s own question, then Home', async () => {
  kept.clear();
  notAskedYet();
  answerPlatform();
  const view = await launch();
  await signIn();
  await asInProduction(async () => {
    await press('Turn on');
  });
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  expect([view.getPathname(), view.getSegments()]).toEqual(['/', ['(tabs)', '(home)']]);
});

it('after the Face ID offer where that is asked: Face ID, then notifications, then Home', async () => {
  kept.clear();
  notAskedYet();
  Biometrics.hasHardwareAsync.mockImplementation(async () => true);
  Biometrics.isEnrolledAsync.mockImplementation(async () => true);
  answerPlatform();
  const view = await launch();
  await signIn();
  expect(view.getSegments()).toEqual(['(auth)', 'faceid-offer']);
  await asInProduction(async () => {
    await press('Not now');
  });
  expect(view.getSegments()).toEqual(['(auth)', 'notifications-offer']);
  await asInProduction(async () => {
    await press('Not now');
  });
  expect([view.getPathname(), view.getSegments()]).toEqual(['/', ['(tabs)', '(home)']]);
});

it.each([
  ['iOS already allows', { status: 'granted', granted: true, canAskAgain: true, expires: 'never' }],
  ['iOS said no', { status: 'denied', granted: false, canAskAgain: false, expires: 'never' }],
])('%s: no offer, straight to Home', async (_name, permission) => {
  kept.clear();
  Notifications.getPermissionsAsync.mockResolvedValue(permission);
  answerPlatform();
  const view = await launch();
  await signIn();
  expect([view.getPathname(), view.getSegments()]).toEqual(['/', ['(tabs)', '(home)']]);
  expect(screen.queryByText('Turn on notifications')).toBeNull();
});
