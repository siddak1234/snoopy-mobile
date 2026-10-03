import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';

import ApprovalsScreen from '@/app/(tabs)/activity/approvals';
import ActivityScreen from '@/app/(tabs)/activity/index';
import { ACTIVITY_EMPTY_TITLE, ADD_FLOW_LABEL, APPROVALS_EMPTY_TITLE } from '@/lib/content/screen-states';
import { routePlatform, signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key'),
}));

const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * The whole-screen empty standard's actions (24.12, the owner's decision 6: "an
 * action where there is one"), each opening where it is configured to (build
 * 13, B9). Flows' two and Teams' Create a team are held where those screens are
 * tested (tab-screens "Flows with no live flow", teams-screens "is the
 * empty-state standard with nothing to list").
 */

const EMPTIES = [
  {
    screen: 'Approvals, with nothing pending',
    site: 'app/(tabs)/activity/approvals.tsx:202',
    Screen: ApprovalsScreen,
    empty: { '/approvals': { approvals: [] } },
    title: APPROVALS_EMPTY_TITLE,
    action: 'Go back',
    opens: { back: 1, push: [] as unknown[] },
  },
  {
    screen: 'Activity, with no run at all',
    site: 'app/(tabs)/activity/index.tsx:275',
    Screen: ActivityScreen,
    empty: { '/runs': { runs: [] } },
    title: ACTIVITY_EMPTY_TITLE,
    action: ADD_FLOW_LABEL,
    opens: { back: 0, push: ['/(tabs)/flows/add'] as unknown[] },
  },
];

beforeEach(() => {
  platformOperation.mockReset();
});

describe("the empty standard's action opens where it is configured to", () => {
  it.each(EMPTIES)('$screen: $action ($site)', async ({ Screen, empty, title, action, opens }) => {
    routePlatform(platformOperation, empty);
    await renderWithProviders(<Screen />, signedInSession);
    expect(await screen.findByTestId('screen-empty')).toBeTruthy();
    expect(screen.getByText(title)).toBeTruthy();

    await fireEvent.press(screen.getByText(action));

    expect(mockRouter.back).toHaveBeenCalledTimes(opens.back);
    expect(mockRouter.push.mock.calls).toEqual(opens.push.map((route) => [route]));
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
