jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'export-key'),
  downloadSignedFile: jest.fn(),
}));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: {} } }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { nativeAuthBaseUrl: 'https://www.example.test/api/platform' } } },
}));

import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Linking, Platform, Share } from 'react-native';

import DataExportScreen from '@/app/(tabs)/settings/data';
import SupportScreen from '@/app/(tabs)/settings/support';
import type { ExportJob } from '@/lib/platform/exports';
import { fakePlatform } from '@/test/fake-platform';
import { TEST_WORKSPACE, sessionAs, signedInSession } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

const { platformOperation, downloadSignedFile } = jest.requireMock('@/lib/platform/client');

let openURL: jest.SpyInstance;
beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  downloadSignedFile.mockReset();
});
afterEach(() => {
  openURL.mockRestore();
  jest.useRealTimers();
});

const job = (status: ExportJob['status'], extra: Partial<ExportJob> = {}): ExportJob => ({
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
      services: [{ service: 'runs', ok: true, data: { runs: [], approvals: [], truncated: true } }],
    });
    await renderWithProviders(<DataExportScreen />, sessionAs('owner'));
    await fireEvent.press(await screen.findByText('Prepare export'));
    expect(
      await screen.findByText('This is a partial export. Some records or service sections are unavailable or bounded.'),
    ).toBeTruthy();
    expect(screen.getByText('Runs: included (bounded)')).toBeTruthy();
  });

  /** Started, followed until ready, with an older link first and the fresh one read at the download. */
  async function readyToDownload() {
    jest.useFakeTimers();
    const fake = routeData('owner');
    const file = (downloadUrl: string) => ({ downloadUrl, artifactId: 'a', filename: 'exports/acme-export.json', sizeBytes: 1, expiresAt: 'x' });
    fake.always('POST /v1/workspaces/{workspaceId}/exports', { export: job('running') });
    fake.once('GET /v1/workspaces/{workspaceId}/exports/{exportId}', {
      export: job('ready', { complete: true, file: file('https://store.example.test/old') }),
    });
    fake.always('GET /v1/workspaces/{workspaceId}/exports/{exportId}', {
      export: job('ready', { complete: true, file: file('https://store.example.test/fresh') }),
    });
    await renderWithProviders(<DataExportScreen />, sessionAs('owner'));
    await fireEvent.press(await screen.findByText('Export everything'));
    expect(await screen.findByText('Preparing everything…')).toBeTruthy();
    expect(fake.to('POST /v1/workspaces/{workspaceId}/exports')[0]!.key).toBe('export-key');

    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    expect(await screen.findByText('Ready. The file holds the whole workspace.')).toBeTruthy();
  }

  it('on iOS saves the complete export into the app, read afresh, and hands it to the share sheet — not Safari (24.12)', async () => {
    const ios = jest.replaceProperty(Platform, 'OS', 'ios');
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const saved = { uri: 'file:///cache/acme-export.json', exists: true, delete: jest.fn() };
    let arrive: (file: typeof saved) => void = () => undefined;
    downloadSignedFile.mockImplementation(() => new Promise((resolve) => (arrive = resolve)));
    await readyToDownload();
    await fireEvent.press(screen.getByText('Download file'));
    expect(await screen.findByText('Saving…')).toBeTruthy();
    await act(async () => arrive(saved));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ url: 'file:///cache/acme-export.json' }));
    expect(downloadSignedFile).toHaveBeenCalledWith('https://store.example.test/fresh', 'exports/acme-export.json');
    // Removed once shared, and never opened in the browser.
    expect(saved.delete).toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
    share.mockRestore();
    ios.restore();
  });

  it('says so when the file could not be saved', async () => {
    const ios = jest.replaceProperty(Platform, 'OS', 'ios');
    downloadSignedFile.mockRejectedValue(new Error('The file could not be saved.'));
    await readyToDownload();
    await fireEvent.press(screen.getByText('Download file'));
    expect(await screen.findByText('The file could not be saved.')).toBeTruthy();
    expect(openURL).not.toHaveBeenCalled();
    ios.restore();
  });

  it("on Android, whose share sheet carries text, opens the fresh link as before", async () => {
    const android = jest.replaceProperty(Platform, 'OS', 'android');
    await readyToDownload();
    await fireEvent.press(screen.getByText('Download file'));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith('https://store.example.test/fresh'));
    expect(downloadSignedFile).not.toHaveBeenCalled();
    android.restore();
  });
});

describe('Support (24.6.4)', () => {
  it('sends the contact form on the public operation, with what was filled in', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always('POST /v1/contact-requests', {
      contactRequestId: '00000000-0000-4000-8000-0000000000c1',
      receivedAt: '2026-09-30T00:00:00Z',
    });
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
