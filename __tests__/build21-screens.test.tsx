jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'run-key'),
}));
jest.mock('@/lib/platform/run-file', () => ({
  ...jest.requireActual('@/lib/platform/run-file'),
  sendRunFile: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: {} } }));

import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import React from 'react';

import LoginScreen from '@/app/(auth)/login';
import HomeScreen from '@/app/(tabs)/(home)/index';
import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import { sendRunFile } from '@/lib/platform/run-file';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { resetPushForTests } from '@/hooks/use-push-registration';
import { fakePlatform } from '@/test/fake-platform';
import {
  approvalsPayload,
  flowCatalogPayload,
  inboxPayload,
  runStatsPayload,
  routePlatform,
  runsPayload,
  signedInSession,
  subscriptionsPayload,
} from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

const { platformOperation } = jest.requireMock('@/lib/platform/client');
const mockSend = sendRunFile as jest.Mock;
const mockPick = DocumentPicker.getDocumentAsync as jest.Mock;

beforeEach(() => {
  platformOperation.mockReset();
  mockSend.mockReset();
  mockPick.mockReset();
  resetSnapshot();
  resetPushForTests();
});

/* ───────────────────────────── A9: a quick run from Home ───────────────────────────── */

/**
 * Build 21, spec A9 (the owner: "when a user wants to run a random flow. they
 * shouldnt have to do a bunch of work in the app"; the session's S16): from
 * Home, a live flow's row (1), the file in its Step 1 (2), Start run (3) — the
 * system's file sheet not counted. ~~Home → Flows → the flow → Take photo →
 * Start run~~, four presses, until Build 21.
 */
describe('a quick run from Home: three presses to a started run (spec A9)', () => {
  it("RUN A FLOW's row (1), Upload in Step 1 (2), Start run (3) — the run started with the file, its page opened", async () => {
    const subscriptions = subscriptionsPayload();
    subscriptions.subscriptions = subscriptions.subscriptions.map((row) =>
      row.id === 'invoice'
        ? { ...row, runInput: [{ key: 'invoiceFile', title: 'Document', description: 'A PDF or photo.', control: 'artifact' as const, required: true }] }
        : row,
    );
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces/{workspaceId}/run-stats', runStatsPayload());
    fake.always('GET /v1/workspaces/{workspaceId}/runs', runsPayload());
    fake.always('GET /v1/workspaces/{workspaceId}/automations', flowCatalogPayload());
    fake.always('GET /v1/workspaces/{workspaceId}/approvals', approvalsPayload());
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', subscriptions);
    fake.always('GET /v1/workspaces/{workspaceId}/connections', { connections: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/notifications', inboxPayload());
    fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [] });
    fake.always('GET /v1/connections/providers', { providers: [] });
    fake.always('POST /v1/workspaces/{workspaceId}/runs', { run: { ...runsPayload().runs[0]!, id: 'run-new', status: 'pending' } });
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/receipts.pdf', name: 'receipts.pdf', mimeType: 'application/pdf', size: 5 }] });
    mockSend.mockResolvedValue({ artifactId: 'artifact-1', filename: 'receipts.pdf', contentType: 'application/pdf', sizeBytes: 5 });
    const presses: string[] = [];

    // 1 — Home: the flow under RUN A FLOW.
    const home = await renderWithProviders(<HomeScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('home-quick-run-invoice'));
    presses.push('flow');
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'invoice' } });
    await home.unmount();

    // The flow page it opens: Step 1 holds the document and Start run.
    setMockParams({ flow: 'invoice' });
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    // 2 — Upload, in Step 1.
    await fireEvent.press(await screen.findByTestId('run-file-invoiceFile-upload'));
    presses.push('upload');
    expect(await screen.findByText('Ready: receipts.pdf (5 bytes)')).toBeTruthy();
    // 3 — Start run.
    await fireEvent.press(screen.getByText('Start run'));
    presses.push('start');

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/(tabs)/(home)/run', params: { runId: 'run-new' } }),
    );
    expect(fake.to('POST /v1/workspaces/{workspaceId}/runs').map((sent) => sent.body)).toEqual([
      { subscriptionId: 'invoice', input: { invoiceFile: 'artifact-1' } },
    ]);
    expect(presses).toHaveLength(3);
  });
});

/* ───────────────────────────── A1: no AI consent anywhere ───────────────────────────── */

/** Every runtime source file the app is built from: what a person can be shown. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sources(full);
    return ['.ts', '.tsx'].includes(extname(full)) ? [full] : [];
  });
}

/**
 * The owner's D1 of 2026-10-15: "we dont need to say this at all: including AI
 * reading of documents you add. the terms and privacy policy includes that
 * information. that is jargon not needed and unnecessarily added." (spec A1).
 */
describe('no AI consent anywhere in the app (spec A1)', () => {
  it('no runtime file says or wires the AI consent — the card, the row, the hook, the account call, the flag', () => {
    const root = join(__dirname, '..');
    const found = ['app', 'components', 'lib', 'hooks']
      .flatMap((dir) => sources(join(root, dir)))
      .filter((file) => !relative(root, file).startsWith('lib/generated/'))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .map((line, index) => [`${relative(root, file)}:${index + 1}`, line] as const)
          .filter(([, line]) => /ai reads|aiDocumentReading|ai-reading|AiConsent|usesAi/iu.test(line))
          .map(([where]) => where),
      );
    expect(found).toEqual([]);
  });

  it("the line under the sign-in buttons is today's, word for word, and says nothing of AI", async () => {
    routePlatform(platformOperation);
    await renderWithProviders(<LoginScreen />);
    const line = await screen.findByText('By continuing, you agree to our Terms of Service and Privacy Policy.');
    expect(line).toBeTruthy();
    expect(screen.queryByText(/\bAI\b/u)).toBeNull();
  });
});
