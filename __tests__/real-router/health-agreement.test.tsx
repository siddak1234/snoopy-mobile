import { router } from 'expo-router';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import { methodOf } from '@/test/platform';
import { WORKSPACE, answerPlatform, flush, launch, signedInOnThisPhone } from '@/test/real-router';

/**
 * The health data agreement under the real router (Round 21 stage 2, C3;
 * CLAUDE.md rule 11, README "Verification": the params a screen takes on
 * arrival). Opened over the screen whose add or run was refused, it is a
 * screen of the Flows tab with what was refused and for which workspace;
 * accepted, it goes back to that screen.
 */

jest.setTimeout(60_000);

/** Which tab the tab bar shows selected. */
function selectedTab(): string | undefined {
  const bar = screen.getByTestId('tab-bar');
  return within(bar)
    .getAllByRole('tab')
    .find((tab) => tab.props.accessibilityState?.selected)?.props.accessibilityLabel;
}

const AGREEMENT = { version: 1, text: 'This Business Associate Agreement is made between {Covered Entity} and Autom8x.', sha256: 'a'.repeat(64) };
/** What the acceptance answers. */
const DOCUMENT = {
  id: '00000000-0000-4000-8000-0000000000d1',
  kind: 'health-data',
  version: 1,
  signerName: 'Dana Reyes',
  signerTitle: 'Practice manager',
  acceptedAt: '2026-11-03T15:00:00Z',
};

it('opens in the Flows tab with what was refused; accepted, it goes back to the screen that opened it', async () => {
  signedInOnThisPhone();
  const accepted: string[] = [];
  answerPlatform({
    '/v1/agreements/health-data': () => AGREEMENT,
    [`/v1/workspaces/${WORKSPACE}/agreements`]: (_path, execute) => {
      accepted.push(methodOf(execute) ?? '');
      return { document: DOCUMENT };
    },
  });
  const view = await launch();
  await act(async () => router.push('/(tabs)/flows'));
  await flush(100);
  await flush(1000);
  await act(async () => router.push({ pathname: '/(tabs)/flows/agreement', params: { action: 'run', workspace: WORKSPACE } }));
  await flush(100);
  await flush(1000);
  expect(view.getSegments()).toEqual(['(tabs)', 'flows', 'agreement']);
  expect(view.getSearchParams()).toMatchObject({ action: 'run', workspace: WORKSPACE });
  expect(selectedTab()).toBe('Flows');
  expect(await screen.findByText('Accept and start run')).toBeTruthy();
  expect(screen.getByText("I'm authorized to sign for Acme")).toBeTruthy();

  await fireEvent.press(within(screen.getByTestId('agreement-authorized')).getByRole('switch'));
  await fireEvent.changeText(screen.getByLabelText('Full name'), 'Dana Reyes');
  await fireEvent.changeText(screen.getByLabelText('Title'), 'Practice manager');
  await fireEvent.press(screen.getByTestId('agreement-accept'));
  await flush(100);
  await flush(1000);
  expect(accepted).toEqual(['POST']);
  expect(view.getPathname()).toBe('/flows');
});
