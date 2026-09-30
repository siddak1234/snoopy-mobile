jest.mock('@/lib/platform/client', () => ({ platformOperation: jest.fn(), newIdempotencyKey: jest.fn(() => 'export-key') }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: {} } }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { nativeAuthBaseUrl: 'https://www.example.test/api/platform' } } },
}));

import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';

import DataExportScreen from '@/app/(tabs)/settings/data';
import SupportScreen from '@/app/(tabs)/settings/support';
import { fakePlatform } from '@/test/fake-platform';
import { TEST_WORKSPACE, sessionAs, signedInSession } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

const { platformOperation } = jest.requireMock('@/lib/platform/client');

let openURL: jest.SpyInstance;
beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => {
  openURL.mockRestore();
  jest.useRealTimers();
});

const job = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 'export-1',
  status,
  createdAt: '2026-09-30T00:00:00Z',
  ...extra,
});

function routeData(role: 'owner' | 'member') {
  const fake = fakePlatform(platformOperation);
  fake.always('GET /v1/workspaces', {
    workspaces: [{ id: TEST_WORKSPACE, name: 'Acme', type: 'organization', role }],
    activeWorkspaceId: TEST_WORKSPACE,
  });
  return fake;
}

describe('Data export (24.6.3)', () => {
  it("is an owner's or admin's: a member is told why, and offered nothing", async () => {
    routeData('member');
    await renderWithProviders(<DataExportScreen />, sessionAs('member'));
    expect(await screen.findByText(/Exporting a workspace is for its owners and admins/)).toBeTruthy();
    expect(screen.queryByText('Prepare export')).toBeNull();
    expect(screen.queryByText('Export everything')).toBeNull();
  });

  it('says a bounded summary is partial when a part it included was cut short', async () => {
    const fake = routeData('owner');
    fake.always('GET /v1/workspaces/{workspaceId}/export', {
      workspaceId: TEST_WORKSPACE,
      exportedAt: '2026-09-30T00:00:00Z',
      complete: true,
      services: [{ service: 'runs', ok: true, data: { truncated: true } }],
    });
    await renderWithProviders(<DataExportScreen />, sessionAs('owner'));
    await fireEvent.press(await screen.findByText('Prepare export'));
    expect(
      await screen.findByText('This is a partial export. Some records or service sections are unavailable or bounded.'),
    ).toBeTruthy();
    expect(screen.getByText('Runs: included (bounded)')).toBeTruthy();
  });

  it('follows the complete export until it is ready, and reads the link again at the moment of the download', async () => {
    jest.useFakeTimers();
    const fake = routeData('owner');
    fake.always('POST /v1/workspaces/{workspaceId}/exports', { export: job('running') });
    fake.once('GET /v1/workspaces/{workspaceId}/exports/{exportId}', {
      export: job('ready', { complete: true, file: { downloadUrl: 'https://store.example.test/old', artifactId: 'a', filename: 'f', sizeBytes: 1, expiresAt: 'x' } }),
    });
    fake.once('GET /v1/workspaces/{workspaceId}/exports/{exportId}', {
      export: job('ready', { complete: true, file: { downloadUrl: 'https://store.example.test/fresh', artifactId: 'a', filename: 'f', sizeBytes: 1, expiresAt: 'x' } }),
    });
    await renderWithProviders(<DataExportScreen />, sessionAs('owner'));
    await fireEvent.press(await screen.findByText('Export everything'));
    expect(await screen.findByText('Preparing everything…')).toBeTruthy();
    expect(fake.to('POST /v1/workspaces/{workspaceId}/exports')[0]!.key).toBe('export-key');

    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    expect(await screen.findByText('Ready. The file holds the whole workspace.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Download file'));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith('https://store.example.test/fresh'));
  });
});

describe('Support (24.6.4)', () => {
  it('sends the contact form on the public operation, with what was filled in', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always('POST /v1/contact-requests', { id: 'c1' });
    await renderWithProviders(<SupportScreen />, signedInSession);

    await fireEvent.press(screen.getByText('Send'));
    expect(await screen.findByText('Add the workflow you want to automate, and your email.')).toBeTruthy();
    expect(fake.to('POST /v1/contact-requests')).toHaveLength(0);

    await fireEvent.changeText(screen.getByPlaceholderText('Invoices arrive by email, keyed into the ERP'), 'Invoices by email');
    await fireEvent.changeText(screen.getByPlaceholderText('you@company.com'), ' alex@acme.co ');
    await fireEvent.press(screen.getByText('Send'));
    expect(
      await screen.findByText("Thanks — we've got it. We review every workflow and reply within two business days."),
    ).toBeTruthy();
    expect(fake.to('POST /v1/contact-requests')[0]!.body).toEqual({ email: 'alex@acme.co', workflow: 'Invoices by email' });
  });

  it('opens Privacy and Terms on the website', async () => {
    fakePlatform(platformOperation);
    await renderWithProviders(<SupportScreen />, signedInSession);
    await fireEvent.press(screen.getByTestId('support-privacy'));
    await fireEvent.press(screen.getByTestId('support-terms'));
    expect(openURL).toHaveBeenNthCalledWith(1, 'https://www.example.test/privacy');
    expect(openURL).toHaveBeenNthCalledWith(2, 'https://www.example.test/terms');
  });
});
