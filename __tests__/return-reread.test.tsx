import { act, fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { Pressable, Text } from 'react-native';

import ApprovalsScreen from '@/app/(tabs)/activity/approvals';
import FlowsScreen from '@/app/(tabs)/flows/index';
import { useWorkflows } from '@/hooks/use-workflows';
import {
  approvalsPayload,
  flowCatalogPayload,
  routePlatform,
  signedInSession,
  subscriptionsPayload,
} from '@/test/platform';
import { renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

/** Every focus callback, so the test can return to the screen as a person does. */
const mockFocusEffects: (() => void)[] = [];
jest.mock('expo-router', () => {
  const actual = jest.requireActual('@/test/mocks/expo-router');
  const ReactActual = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) =>
      ReactActual.useEffect(() => {
        mockFocusEffects.push(effect);
        effect();
      }, [effect]),
  };
});

/**
 * What a return to a screen re-reads (24.4.4), and what must follow from it.
 *
 * A return to the inbox re-reads it, and the platform then lists only
 * what is still pending. The count and the "all caught up" line must describe
 * that list — a decision on an approval no longer listed is not a pending one
 * cleared.
 */
it('counts what is still pending after a re-read drops the decided approvals', async () => {
  const pending = approvalsPayload();
  routePlatform(platformOperation, { '/automations': flowCatalogPayload(), '/approvals': pending });
  await renderWithProviders(<ApprovalsScreen />, signedInSession);
  expect(await screen.findByText('3')).toBeTruthy();

  await fireEvent.press(screen.getAllByText('Approve')[0]!);
  expect(screen.getByText('2')).toBeTruthy();

  // The platform no longer lists the one just approved.
  routePlatform(platformOperation, {
    '/automations': flowCatalogPayload(),
    '/decision': { approval: pending.approvals[0] },
    '/approvals': { approvals: pending.approvals.slice(1) },
  });
  await act(async () => mockFocusEffects.at(-1)?.());

  expect(await screen.findAllByText('Approve')).toHaveLength(2);
  expect(screen.getByText('2')).toBeTruthy();
  expect(screen.queryByText('All caught up — decisions synced to your workflows.')).toBeNull();
});

it('shows the platform\'s status once the Flows list reads again, over what detail recorded', async () => {
  // Detail records the answer to its change so the list agrees before it reads
  // again. A status changed anywhere else must then show — here the platform
  // still says `live` for a workflow this device recorded as Paused.
  function Recorder() {
    const { record } = useWorkflows();
    return (
      <Pressable testID="record" onPress={() => record('invoice', 'Paused')}>
        <Text>record</Text>
      </Pressable>
    );
  }
  routePlatform(platformOperation, { '/automations': flowCatalogPayload(), '/subscriptions': subscriptionsPayload() });
  await renderWithProviders(
    <>
      <Recorder />
      <FlowsScreen />
    </>,
    signedInSession,
  );
  expect(await screen.findByText('Invoice triage')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('record'));
  expect(screen.getAllByText('Paused').length).toBe(2);

  // The screen regains focus: every read it registered re-runs — the list's,
  // and the scope control's (24.9.2) — not only the last one registered.
  await act(async () => {
    for (const effect of mockFocusEffects) effect?.();
  });
  // Only the fixture's own paused flow is Paused now.
  expect(await screen.findAllByText('Paused')).toHaveLength(1);
});
