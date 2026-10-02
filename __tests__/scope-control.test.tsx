import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';

import FlowsScreen from '@/app/(tabs)/flows/index';
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
 * The scope control (BUILD-PLAN 24.9.2): the workspace, then All projects or
 * one project; Flows follows it, and the choice is kept per workspace.
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

  it('shows every flow for All projects, labelled by scope, and the project pill only where projects exist', async () => {
    await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await screen.findByText('Invoice triage')).toBeTruthy();
    expect(screen.getByLabelText('Project: All projects')).toBeTruthy();
    expect(screen.getByText(/^Project: Finance · /u)).toBeTruthy();
    expect(screen.getAllByText(/^Whole workspace · /u).length).toBeGreaterThan(0);
  });

  it('narrows Flows to the chosen project, keeps the choice, and says when the project has none', async () => {
    await renderWithProviders(<FlowsScreen />, signedInSession);
    await screen.findByText('Invoice triage');
    await fireEvent.press(screen.getByLabelText('Project: All projects'));
    await fireEvent.press(await screen.findByTestId('scope-option-project-1'));
    expect(await screen.findByLabelText('Project: Finance')).toBeTruthy();
    expect(screen.getByText('Invoice triage')).toBeTruthy();
    expect(screen.queryByText('Email triage')).toBeNull();
    // Inside a project the scope label is not repeated on every row.
    expect(screen.queryByText(/^Project: Finance · /u)).toBeNull();
    expect(writeScope).toHaveBeenCalledWith(expect.any(String), 'project-1');
  });

  it('restores the kept choice for the workspace on the next visit', async () => {
    mockStored.set(TEST_WORKSPACE, 'project-1');
    await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await screen.findByLabelText('Project: Finance')).toBeTruthy();
    expect(await screen.findByText('Invoice triage')).toBeTruthy();
    expect(screen.queryByText('Email triage')).toBeNull();
  });
});
