import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import { runDetailPayload, type RouteOverrides } from '@/test/platform';
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

it('a run\'s View package opens the package page in Activity, with its runId; Back returns to the run', async () => {
  signedInOnThisPhone();
  const run = runDetailPayload('run-0');
  answerPlatform({}, {
    '/runs/run-0': {
      ...run,
      run: { ...run.run, status: 'succeeded' },
      documents: [
        {
          index: 1,
          status: 'saved',
          statusText: 'Saved',
          type: 'invoice',
          vendor: { name: 'Northwind Supply', address: null, city: null, storeNumber: null },
          number: 'NW-100',
          numberLabel: 'Invoice #',
          references: [],
          date: '2026-10-14',
          time: null,
          currency: 'USD',
          lineItems: [],
          lineItemsComplete: true,
          subtotal: '90.00',
          tax: '10.00',
          tip: null,
          discount: null,
          total: '100.00',
          payment: { method: 'not_shown', cardLast4: null },
          recordedIn: null,
          details: [],
        },
      ],
    },
    '/runs/run-0/package': {
      format: 'pdf',
      filename: 'run-run-0.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1000,
      downloadUrl: 'https://files.example.test/run-0.pdf?sig=1',
      expiresAt: '2026-10-20T12:00:00Z',
    },
    // One run and its package by path, which the typed fragments do not name.
  } as RouteOverrides);
  const view = await launch();
  await open({ text: 'Run #4821 · posted to QuickBooks' });
  await open({ testID: 'run-view-package' });
  expect(view.getSegments()).toEqual(['(tabs)', 'activity', 'package']);
  expect(view.getSearchParams()).toMatchObject({ runId: 'run-0' });
  expect(selectedTab()).toBe('Activity');
  expect((await screen.findByTestId('package-webview')).props.source).toEqual({ uri: 'file:///cache/view-run-run-0.pdf' });

  await pressBack();
  expect(view.getSegments()).toEqual(['(tabs)', 'activity', 'run']);
});
