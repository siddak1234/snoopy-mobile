import { act, fireEvent, screen } from 'expo-router/testing-library';

import { flowCatalogPayload } from '@/test/platform';
import { answerPlatform, flush, launch, signedInOnThisPhone } from '@/test/real-router';

/**
 * A held run's notification lands on Approvals, where it is decided — the
 * website's page for it — from the inbox and from a push (Gate 24's parity
 * pass, G1's notification half; Activity until then). The unit tests hold the
 * href each sends; only the real router shows where that href lands.
 */

jest.setTimeout(60_000);

const Notifications = jest.requireMock('expo-notifications') as {
  addNotificationResponseReceivedListener: jest.Mock;
};

/** What Approvals alone draws: a held run's card, its link to the run it holds. */
const onApprovals = () => screen.getByTestId('view-run-apr-0');

it("a held run's row in the inbox opens Approvals, not Activity", async () => {
  signedInOnThisPhone();
  answerPlatform({}, { '/automations': flowCatalogPayload() });
  const view = await launch();

  await fireEvent.press(screen.getByLabelText('Notifications'));
  await flush(100);
  await flush(1000);
  expect(view.getPathname()).toBe('/notifications');

  await fireEvent.press(screen.getAllByText('Run held for review')[0]!);
  await flush(100);
  await flush(1000);
  expect(view.getPathname()).toBe('/activity/approvals');
  expect(onApprovals()).toBeTruthy();
});

it('a push for a held run, tapped while the app runs, opens Approvals, not Activity', async () => {
  signedInOnThisPhone();
  answerPlatform({}, { '/automations': flowCatalogPayload() });
  const view = await launch();
  expect(view.getPathname()).toBe('/');

  const opened = Notifications.addNotificationResponseReceivedListener.mock.calls.at(-1)![0] as (response: unknown) => void;
  await act(async () =>
    opened({
      notification: {
        request: {
          identifier: 'held-push-1',
          content: { data: { event: 'approval-requested', runId: 'run-0', approvalId: 'apr-0' } },
        },
      },
    }),
  );
  await flush(100);
  await flush(1000);
  expect(view.getPathname()).toBe('/activity/approvals');
  expect(onApprovals()).toBeTruthy();
});
