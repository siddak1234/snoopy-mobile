import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';

import FlowsScreen from '@/app/(tabs)/flows/index';
import { ScopeControl } from '@/components/scope-control';
import { fakePlatform } from '@/test/fake-platform';
import { renderWithProviders } from '@/test/render';
import {
  TEST_WORKSPACE,
  flowCatalogPayload,
  projectsPayload,
  routePlatform,
  signedInSession,
  subscriptionsPayload,
} from '@/test/platform';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key-1'),
}));

// The choice is kept on the device; here, in memory for one test.
const mockStored = new Map<string, string | null>();
jest.mock('@/lib/platform/scope-store', () => ({
  readScope: jest.fn(async (workspaceId: string) => mockStored.get(workspaceId) ?? null),
  writeScope: jest.fn(async (workspaceId: string, projectId: string | null) => {
    mockStored.set(workspaceId, projectId);
  }),
}));

const { platformOperation } = jest.requireMock('@/lib/platform/client');
const { readScope, writeScope } = jest.requireMock('@/lib/platform/scope-store');

/**
 * The scope control (BUILD-PLAN 24.9.2; teams since 24.11.7): the workspace,
 * then All teams or one team; Flows follows it, and the choice is kept per
 * workspace.
 */
describe('the scope control on Flows', () => {
  beforeEach(() => {
    mockStored.clear();
    platformOperation.mockReset();
    readScope.mockClear();
    writeScope.mockClear();
    const subscriptions = subscriptionsPayload();
    // The first flow belongs to the project; the rest are workspace-wide.
    subscriptions.subscriptions = subscriptions.subscriptions.map((row, index) =>
      index === 0 ? { ...row, projectId: 'project-1' } : { ...row, projectId: null },
    );
    routePlatform(platformOperation, {
      '/automations': flowCatalogPayload(),
      '/subscriptions': subscriptions,
      '/projects': projectsPayload('Finance'),
    });
  });

  it('shows every flow for All teams, labelled by scope', async () => {
    await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await screen.findByText('Invoice triage')).toBeTruthy();
    expect(screen.getByLabelText('Team: All teams')).toBeTruthy();
    expect(screen.getByText(/^Team: Finance · /u)).toBeTruthy();
    expect(screen.getAllByText(/^Whole workspace · /u).length).toBeGreaterThan(0);
  });

  it('narrows Flows to the chosen team, and keeps the choice', async () => {
    await renderWithProviders(<FlowsScreen />, signedInSession);
    await screen.findByText('Invoice triage');
    await fireEvent.press(screen.getByLabelText('Team: All teams'));
    await fireEvent.press(await screen.findByTestId('scope-option-project-1'));
    expect(await screen.findByLabelText('Team: Finance')).toBeTruthy();
    expect(screen.getByText('Invoice triage')).toBeTruthy();
    expect(screen.queryByText('Email triage')).toBeNull();
    // Inside a team the scope label is not repeated on every row.
    expect(screen.queryByText(/^Team: Finance · /u)).toBeNull();
    expect(writeScope).toHaveBeenCalledWith(expect.any(String), 'project-1');
  });

  it('restores the kept choice for the workspace on the next visit', async () => {
    mockStored.set(TEST_WORKSPACE, 'project-1');
    await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await screen.findByLabelText('Team: Finance')).toBeTruthy();
    expect(await screen.findByText('Invoice triage')).toBeTruthy();
    expect(screen.queryByText('Email triage')).toBeNull();
  });
});

describe('the team pill (24.11.7)', () => {
  beforeEach(() => {
    mockStored.clear();
    platformOperation.mockReset();
    writeScope.mockClear();
  });

  it('is there before any team exists, and Create a team makes one and makes it the scope', async () => {
    const fake = fakePlatform(platformOperation);
    let made = false;
    const payables = {
      id: 'p-new',
      workspaceId: TEST_WORKSPACE,
      name: 'Payables',
      type: 'Finance',
      status: 'active',
      viewerRole: 'owner',
      createdAt: '2026-10-02T00:00:00Z',
    };
    fake.always('GET /v1/workspaces/{workspaceId}/projects', () => ({ projects: made ? [payables] : [] }));
    fake.always('GET /v1/workspaces', {
      workspaces: [{ id: TEST_WORKSPACE, name: 'Acme', type: 'organization', role: 'owner' }],
      activeWorkspaceId: TEST_WORKSPACE,
    });
    fake.always('POST /v1/workspaces/{workspaceId}/projects', () => {
      made = true;
      return { project: payables };
    });
    await renderWithProviders(<ScopeControl />, signedInSession);
    await fireEvent.press(await screen.findByLabelText('Team: All teams'));
    await fireEvent.press(await screen.findByTestId('scope-create-team'));
    await fireEvent.changeText(await screen.findByPlaceholderText('Accounts payable'), 'Payables');
    await fireEvent.press(screen.getByTestId('team-kind'));
    await fireEvent.press(screen.getByTestId('team-kind-option-Finance'));
    const create = await screen.findAllByText('Create team');
    await fireEvent.press(create[create.length - 1]!);
    await fireEvent.press(await screen.findByText('Done'));
    expect(await screen.findByLabelText('Team: Payables')).toBeTruthy();
    expect(writeScope).toHaveBeenCalledWith(TEST_WORKSPACE, 'p-new');
    expect(fake.to('POST /v1/workspaces/{workspaceId}/projects')[0]!.body).toEqual({ name: 'Payables', type: 'Finance' });
  });
});
