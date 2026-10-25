import { fireEvent, screen, within } from '@testing-library/react-native';
import React from 'react';

import FlowsScreen from '@/app/(tabs)/flows/index';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { WHOLE_WORKSPACE, groupFlows, type FlowView } from '@/lib/view/catalog';
import { flowCatalogPayload, projectsPayload, routePlatform, signedInSession, subscriptionsPayload } from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key'),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * Build 28's Flows list (the owner's item F1: "there should be sections in the
 * flow page now. It should be easy to know which department a flow is for.
 * Maybe alphabetical. Like A-Z by department type"): the flows by department,
 * the departments A–Z by their kind, then the whole workspace's, each group's
 * flows in the order read. The departments here are made up.
 */

const flow = (key: string, projectId: string | null): FlowView =>
  ({ key, name: key, projectId }) as unknown as FlowView;

describe('the Flows list by department (lib/view/catalog.ts)', () => {
  it('the departments A–Z by their kind, then the whole workspace, then a department not read; the order read within each', () => {
    // An order neither the read order nor a sort by name would give.
    const labels = new Map([
      ['p-ops', 'Operations'],
      ['p-acc', 'Accounting'],
      ['p-hr', 'HR'],
      ['p-acc-2', 'Accounting'],
    ]);
    const groups = groupFlows(
      [
        flow('zeta', 'p-ops'),
        flow('beta', null),
        flow('omega', 'p-acc'),
        flow('alpha', 'p-hr'),
        flow('gamma', 'p-gone'),
        flow('delta', 'p-acc-2'),
        flow('kappa', 'p-acc'),
      ],
      labels,
    );
    expect(groups.map((group) => [group.name, group.flows.map((f) => f.key)])).toEqual([
      ['Accounting', ['omega', 'delta', 'kappa']],
      ['HR', ['alpha']],
      ['Operations', ['zeta']],
      [WHOLE_WORKSPACE, ['beta']],
      [null, ['gamma']],
    ]);
    expect(groupFlows([], labels)).toEqual([]);
  });
});

describe('the Flows screen (F1)', () => {
  beforeEach(() => {
    platformOperation.mockReset();
    resetSnapshot();
  });

  it("draws each department's name over its flows, A–Z, the whole workspace's last; a card still opens its flow", async () => {
    const subs = subscriptionsPayload();
    // invoice → Operations, email → Accounting, kpi → the whole workspace, lead → Accounting.
    const placed = {
      subscriptions: subs.subscriptions.map((sub, i) => ({
        ...sub,
        projectId: (['project-1', 'project-2', null, 'project-2'] as const)[i] ?? null,
      })),
    };
    routePlatform(platformOperation, {
      '/automations': flowCatalogPayload(),
      '/subscriptions': placed,
      '/projects': projectsPayload('Operations', 'Accounting'),
    });
    await renderWithProviders(<FlowsScreen />, signedInSession);
    await screen.findByTestId('flows-group-0');
    const names = (g: number) => {
      const texts = within(screen.getByTestId(`flows-group-${g}`)).getAllByText(/./u).map((node) => node.props.children);
      return [texts[0], ...['Invoice triage', 'Email triage', 'Weekly KPI report', 'Lead enrichment'].filter((n) => texts.includes(n))];
    };
    expect([names(0), names(1), names(2)]).toEqual([
      ['ACCOUNTING', 'Email triage', 'Lead enrichment'],
      ['OPERATIONS', 'Invoice triage'],
      ['WHOLE WORKSPACE', 'Weekly KPI report'],
    ]);
    expect(screen.queryByTestId('flows-group-3')).toBeNull();
    // Each card still says its department (D4).
    expect(within(screen.getByTestId('flows-group-1')).getByText(/^Department: Operations · /u)).toBeTruthy();
    await fireEvent.press(screen.getByText('Invoice triage'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'invoice' } });
  });

  it('a search keeps the groups of what it finds', async () => {
    routePlatform(platformOperation, { '/automations': flowCatalogPayload() });
    await renderWithProviders(<FlowsScreen />, signedInSession);
    await screen.findByTestId('flows-group-0');
    await fireEvent.changeText(screen.getByPlaceholderText('Search flows'), 'lead');
    expect(within(screen.getByTestId('flows-group-0')).getByText('Lead enrichment')).toBeTruthy();
    expect(screen.queryByText('Invoice triage')).toBeNull();
    expect(screen.queryByTestId('flows-group-1')).toBeNull();
  });
});
