import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Platform, Share } from 'react-native';

import RunPackageScreen from '@/app/(tabs)/activity/package';
import { FileNotSavedError, PlatformBusyError, PlatformError } from '@/lib/platform/problem';
import { TEST_WORKSPACE, signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn((prefix: string) => `${prefix}-1`),
  downloadSignedFile: jest.fn(),
}));
// The WebView is a view whose props a test reads (`test/jest-setup.js`).

const { platformOperation, downloadSignedFile } = jest.requireMock('@/lib/platform/client');
jest.mock('expo-file-system', () => require('@/test/mocks/expo-file-system'));
const { PICKED_FOLDER, fileSystemState } = jest.requireMock('expo-file-system');

const RUN_ID = '793eef82-102d-81be-a2d3-9e8d4e2b2c36';
const link = (format: 'pdf' | 'xlsx') => ({
  format,
  filename: `run-${RUN_ID}.${format}`,
  contentType: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  sizeBytes: 52000,
  downloadUrl: `https://files.example.test/run.${format}?sig=1`,
  expiresAt: '2026-10-20T12:00:00Z',
});

/** What each package request sent, and how the platform answers the next ones. */
let sent: { body: unknown; key?: string }[] = [];
let answers: (() => unknown)[] = [];
const saved: { name: string; delete: jest.Mock; exists: boolean }[] = [];

beforeEach(() => {
  sent = [];
  answers = [];
  saved.length = 0;
  setMockParams({ runId: RUN_ID });
  platformOperation.mockReset().mockImplementation(async (path: string, execute: (clients: unknown) => Promise<{ data: unknown }>) => {
    expect(path).toBe(`/v1/workspaces/${TEST_WORKSPACE}/runs/${RUN_ID}/package`);
    const post = async (_template: string, init: { body: { format: 'pdf' | 'xlsx' }; params: { header: Record<string, string> } }) => {
      sent.push({ body: init.body, key: init.params.header['Idempotency-Key'] });
      const next = answers.shift();
      return { data: next ? next() : link(init.body.format) };
    };
    return (await execute({ automations: { POST: post } })).data;
  });
  downloadSignedFile.mockReset().mockImplementation(async (_url: string, name: string) => {
    const file = { name, delete: jest.fn(), exists: true, uri: `file:///cache/${name}` };
    saved.push(file);
    return file;
  });
});

/**
 * The run package page (round 24 P12; the owner's build 23 F16: "The view
 * button should take them to a page showing the package"; the main session's
 * correction: the PDF itself in a WebView).
 */
describe('the run package page', () => {
  it('prepares, asks for the PDF with a key and the phone\'s zone, saves it into the cache under its own name, and draws that file in a WebView', async () => {
    let release: () => void = () => undefined;
    answers.push(() => new Promise((done) => (release = () => done(link('pdf')))));
    await renderWithProviders(<RunPackageScreen />, signedInSession);
    expect(screen.getByTestId('package-preparing')).toBeTruthy();
    expect(screen.getByText('Preparing the package…')).toBeTruthy();
    expect(screen.getByText('Run package')).toBeTruthy();
    await act(async () => release());
    const web = await screen.findByTestId('package-webview');
    expect(web.props.source).toEqual({ uri: `file:///cache/view-run-${RUN_ID}.pdf` });
    expect(web.props.allowingReadAccessToURL).toBe('file:///cache/');
    expect(sent).toEqual([{ body: { format: 'pdf', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, key: 'run-package-pdf-1' }]);
    expect(downloadSignedFile).toHaveBeenCalledWith('https://files.example.test/run.pdf?sig=1', `view-run-${RUN_ID}.pdf`);
    expect(screen.queryByTestId('package-preparing')).toBeNull();
  });

  it('deletes the cached file when the page closes', async () => {
    const view = await renderWithProviders(<RunPackageScreen />, signedInSession);
    await screen.findByTestId('package-webview');
    expect(saved[0]!.delete).not.toHaveBeenCalled();
    await view.unmount();
    expect(saved[0]!.delete).toHaveBeenCalledTimes(1);
  });

  it('busy after the wait it asked for: "Could not open the package. Try again." — Retry asks again and draws it', async () => {
    const busy = () => {
      throw new PlatformBusyError('Busy', 0, 'package_busy');
    };
    answers.push(busy, busy);
    await renderWithProviders(<RunPackageScreen />, signedInSession);
    expect(await screen.findByText('Could not open the package. Try again.')).toBeTruthy();
    // Asked twice: once, then once more after the stated wait.
    expect(sent).toHaveLength(2);
    expect(downloadSignedFile).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByTestId('package-webview')).toBeTruthy();
    expect(sent).toHaveLength(3);
  });

  it('busy, then a 503 naming no wait: the same words, nothing saved', async () => {
    answers.push(
      () => {
        throw new PlatformBusyError('Busy', 0, 'package_busy');
      },
      () => {
        throw new PlatformError('Service Unavailable', 503);
      },
    );
    await renderWithProviders(<RunPackageScreen />, signedInSession);
    expect(await screen.findByText('Could not open the package. Try again.')).toBeTruthy();
    expect(sent).toHaveLength(2);
    expect(downloadSignedFile).not.toHaveBeenCalled();
  });

  it.each([
    ['over 25 MiB (26,214,401 bytes)', () => ({ ...link('pdf'), sizeBytes: 26_214_401 })],
    ['not a PDF', () => link('xlsx')],
  ])('a file %s is refused before anything is saved, in the website\'s words — Retry asks again', async (_case, answer) => {
    answers.push(answer);
    await renderWithProviders(<RunPackageScreen />, signedInSession);
    expect(await screen.findByText('Could not open the package. Try again.')).toBeTruthy();
    expect(downloadSignedFile).not.toHaveBeenCalled();
    expect(screen.queryByTestId('package-webview')).toBeNull();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByTestId('package-webview')).toBeTruthy();
  });

  it('a link that is not https: the website\'s words, nothing saved — Retry asks again and draws it', async () => {
    answers.push(() => ({ ...link('pdf'), downloadUrl: 'http://files.example.test/run.pdf?sig=1' }));
    await renderWithProviders(<RunPackageScreen />, signedInSession);
    expect(await screen.findByText('Could not open the package. Try again.')).toBeTruthy();
    expect(screen.queryByText('The link to the file cannot be used.')).toBeNull();
    expect(downloadSignedFile).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByTestId('package-webview')).toBeTruthy();
  });

  it('a file that could not be saved: the website\'s words — Retry saves it and draws it', async () => {
    downloadSignedFile.mockRejectedValueOnce(new FileNotSavedError());
    await renderWithProviders(<RunPackageScreen />, signedInSession);
    expect(await screen.findByText('Could not open the package. Try again.')).toBeTruthy();
    expect(screen.queryByText('The file could not be saved.')).toBeNull();
    expect(screen.queryByTestId('package-webview')).toBeNull();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByTestId('package-webview')).toBeTruthy();
  });

  it('busy: Back leaves', async () => {
    const busy = () => {
      throw new PlatformBusyError('Busy', 0, 'package_busy');
    };
    answers.push(busy, busy);
    await renderWithProviders(<RunPackageScreen />, signedInSession);
    await screen.findByText('Could not open the package. Try again.');
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('a refusal: the error state in the platform\'s words, with Retry and Back', async () => {
    answers.push(() => {
      throw new PlatformError('This run has no documents to package.', 409, 'no_documents');
    });
    await renderWithProviders(<RunPackageScreen />, signedInSession);
    expect(await screen.findByText("Couldn't open the run package")).toBeTruthy();
    expect(screen.getByText('This run has no documents to package.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();
    // Retry asks again, and this time the PDF is drawn.
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByTestId('package-webview')).toBeTruthy();
    expect(sent).toHaveLength(2);
  });

  it('no run named: unavailable, no request', async () => {
    setMockParams({});
    await renderWithProviders(<RunPackageScreen />, signedInSession);
    expect(await screen.findByText("Couldn't open the run package")).toBeTruthy();
    expect(platformOperation).not.toHaveBeenCalled();
    expect(screen.queryByText('Retry')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['package-download-pdf', 'pdf'],
    ['package-download-excel', 'xlsx'],
  ] as const)('the header\'s %s saves the %s by the run page\'s path into the folder picked in Files — no share sheet — then removes the cache copy', async (testID, format) => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const os = Platform.OS;
    Platform.OS = 'ios';
    fileSystemState.reset();
    try {
      await renderWithProviders(<RunPackageScreen />, signedInSession);
      await screen.findByTestId('package-webview');
      await fireEvent.press(screen.getByTestId(testID));
      await waitFor(() =>
        expect(fileSystemState.copies).toEqual([`file:///cache/run-${RUN_ID}.${format} -> ${PICKED_FOLDER}run-${RUN_ID}.${format}`]),
      );
      expect(share).not.toHaveBeenCalled();
      expect(sent.at(-1)).toEqual({ body: { format, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, key: `run-package-${format}-1` });
      expect(saved.at(-1)!.delete).toHaveBeenCalledTimes(1);
      // The page's own file is untouched.
      expect(saved[0]!.delete).not.toHaveBeenCalled();
    } finally {
      Platform.OS = os;
      share.mockRestore();
    }
  });

  it('Download PDF, Download Excel, then Share: Share hands the PDF itself to the share sheet — its local address, never the signed link — then removes it', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const os = Platform.OS;
    Platform.OS = 'ios';
    try {
      await renderWithProviders(<RunPackageScreen />, signedInSession);
      await screen.findByTestId('package-webview');
      const order = within(screen.getByTestId('package-actions')).getAllByText(/^(Download PDF|Download Excel|Share)$/u);
      expect(order.map((node) => node.props.children)).toEqual(['Download PDF', 'Download Excel', 'Share']);
      await fireEvent.press(screen.getByTestId('package-share'));
      await waitFor(() => expect(share).toHaveBeenCalledWith({ url: `file:///cache/run-${RUN_ID}.pdf` }));
      expect(JSON.stringify(share.mock.calls)).not.toContain('https:');
      expect(sent.at(-1)).toEqual({ body: { format: 'pdf', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, key: 'run-package-pdf-1' });
      expect(saved.at(-1)!.delete).toHaveBeenCalledTimes(1);
    } finally {
      Platform.OS = os;
      share.mockRestore();
    }
  });

  it('on Android: Download PDF and Download Excel, and no Share', async () => {
    const os = Platform.OS;
    Platform.OS = 'android';
    try {
      await renderWithProviders(<RunPackageScreen />, signedInSession);
      await screen.findByTestId('package-webview');
      expect(screen.getByTestId('package-download-pdf')).toBeTruthy();
      expect(screen.getByTestId('package-download-excel')).toBeTruthy();
      expect(screen.queryByTestId('package-share')).toBeNull();
    } finally {
      Platform.OS = os;
    }
  });

  it.each([
    ['package-download-excel', 'not a workbook', () => link('pdf')],
    ['package-download-excel', 'over 25 MiB', () => ({ ...link('xlsx'), sizeBytes: 26_214_401 })],
    ['package-download-pdf', 'not a PDF', () => link('xlsx')],
  ])('%s answered with a file %s: "Could not download. Try again.", nothing saved', async (testID, _case, answer) => {
    await renderWithProviders(<RunPackageScreen />, signedInSession);
    await screen.findByTestId('package-webview');
    answers.push(answer);
    await fireEvent.press(screen.getByTestId(testID));
    expect(await screen.findByText('Could not download. Try again.')).toBeTruthy();
    // Only the page's own PDF was ever saved.
    expect(downloadSignedFile).toHaveBeenCalledTimes(1);
  });

  it('a download that fails says "Could not download. Try again." under the buttons', async () => {
    await renderWithProviders(<RunPackageScreen />, signedInSession);
    await screen.findByTestId('package-webview');
    answers.push(() => {
      throw new PlatformError('Nope', 500);
    });
    await fireEvent.press(screen.getByTestId('package-download-excel'));
    expect(await screen.findByText('Could not download. Try again.')).toBeTruthy();
    expect(screen.getByTestId('package-webview')).toBeTruthy();
  });
});
