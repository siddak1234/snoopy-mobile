import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import { answerPlatform, flush, launch, pressTab, signedInOnThisPhone } from '@/test/real-router';

/**
 * Runs live in Activity (round 24 P5; the owner's build 23 F4: "When i click the
 * running item why does the slider take me to home. Shouldnt it be in activity",
 * F5: "This should be in activity right?"). Under the REAL router: a run opened
 * from Home, from Home's or Settings' inbox, or from a push is Activity's page,
 * with the Activity tab selected, and Back returns where it came from.
 */

jest.setTimeout(90_000);

const Notifications = jest.requireMock('expo-notifications') as {
  addNotificationResponseReceivedListener: jest.Mock;
};

afterEach(() => {
  jest.restoreAllMocks();
});

/** Which tab the tab bar shows selected. */
function selectedTab(): string | undefined {
  const bar = screen.getByTestId('tab-bar');
  return within(bar)
    .getAllByRole('tab')
    .find((tab) => tab.props.accessibilityState?.selected)?.props.accessibilityLabel;
}

/** The run page's own Back circle (a screen behind it may draw one too). */
async function pressBack() {
  const backs = await screen.findAllByLabelText('Back');
  await fireEvent.press(backs[backs.length - 1]!);
  await flush(100);
  await flush(1000);
}

async function open(testIDOrText: { testID?: string; text?: string }) {
  const target = testIDOrText.testID
    ? await screen.findByTestId(testIDOrText.testID)
    : (await screen.findAllByText(testIDOrText.text!))[0]!;
  await fireEvent.press(target);
  await flush(100);
  await flush(1000);
}

it("Home's recent run opens in Activity, with Activity selected; Back returns to Home, Home selected", async () => {
  signedInOnThisPhone();
  answerPlatform();
  const view = await launch();
  expect(view.getPathname()).toBe('/');

  await open({ text: 'Run #4821 · posted to QuickBooks' });
  expect(view.getSegments()).toEqual(['(tabs)', 'activity', 'run']);
  expect(view.getSearchParams()).toMatchObject({ runId: 'run-0', returnTo: 'home' });
  expect(selectedTab()).toBe('Activity');
  expect(await screen.findByTestId('run-title')).toBeTruthy();

  await pressBack();
  expect(view.getPathname()).toBe('/');
  expect(selectedTab()).toBe('Home');

  // The run left Activity's stack: the tab opens Activity itself, not the run.
  await pressTab('Activity');
  expect(view.getPathname()).toBe('/activity');
});

it("re-tapping Activity's tab on a run from Home stays in Activity: its list, not Home", async () => {
  signedInOnThisPhone();
  answerPlatform();
  const view = await launch();

  await open({ text: 'Run #4821 · posted to QuickBooks' });
  expect(view.getSegments()).toEqual(['(tabs)', 'activity', 'run']);
  await pressTab('Activity');
  expect(view.getPathname()).toBe('/activity');
  expect(selectedTab()).toBe('Activity');
});

it('Home › bell › a failed run, then Back: Notifications is still open, Home selected', async () => {
  signedInOnThisPhone();
  answerPlatform();
  const view = await launch();

  await fireEvent.press(screen.getByLabelText('Notifications'));
  await flush(100);
  await flush(1000);
  expect(view.getPathname()).toBe('/notifications');

  await open({ text: 'Run failed' });
  expect(view.getSegments()).toEqual(['(tabs)', 'activity', 'run']);
  expect(selectedTab()).toBe('Activity');

  await pressBack();
  expect(view.getPathname()).toBe('/notifications');
  expect(selectedTab()).toBe('Home');
});

it('Settings › Notifications › a failed run, then Back: back in Settings', async () => {
  signedInOnThisPhone();
  answerPlatform();
  const view = await launch();

  await pressTab('Settings');
  await open({ text: 'Notifications' });
  expect(view.getPathname()).toBe('/settings/notifications');

  await open({ text: 'Run failed' });
  expect(view.getSegments()).toEqual(['(tabs)', 'activity', 'run']);
  expect(selectedTab()).toBe('Activity');

  await pressBack();
  expect(view.getPathname()).toBe('/settings/notifications');
  expect(selectedTab()).toBe('Settings');
});

it("a run opened from Activity's own list goes back to Activity", async () => {
  signedInOnThisPhone();
  answerPlatform();
  const view = await launch();

  await pressTab('Activity');
  await open({ text: '32 emails routed · 3 escalated' });
  expect(view.getSegments()).toEqual(['(tabs)', 'activity', 'run']);
  await pressBack();
  expect(view.getPathname()).toBe('/activity');
  expect(selectedTab()).toBe('Activity');
});

it('a push for a failed run opens it in Activity; Back goes to Activity', async () => {
  signedInOnThisPhone();
  answerPlatform();
  const view = await launch();
  expect(view.getPathname()).toBe('/');

  const opened = Notifications.addNotificationResponseReceivedListener.mock.calls.at(-1)![0] as (response: unknown) => void;
  await act(async () =>
    opened({
      notification: {
        request: { identifier: 'failed-push-1', content: { data: { event: 'run-failed', runId: 'run-4' } } },
      },
    }),
  );
  await flush(100);
  await flush(1000);
  expect(view.getSegments()).toEqual(['(tabs)', 'activity', 'run']);
  expect(selectedTab()).toBe('Activity');

  await pressBack();
  expect(view.getPathname()).toBe('/activity');
  expect(selectedTab()).toBe('Activity');
});
