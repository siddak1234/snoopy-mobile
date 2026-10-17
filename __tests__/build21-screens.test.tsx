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
import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import { sendRunFile } from '@/lib/platform/run-file';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { resetPushForTests } from '@/hooks/use-push-registration';
import { fakePlatform } from '@/test/fake-platform';
import {
  approvalsPayload,
  flowCatalogPayload,
  inboxPayload,
  invoiceProcessingV3Entry,
  planSubscriptionsPayload,
  providersWithQuickBooks,
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

/* ~~A9: a quick run from Home (RUN A FLOW)~~ until Build 22: the owner's build 21
   item 1, "Remove run a flow section. We did not add thus." A flow's run starts on
   its page, from Flows or a run's View flow. */

/**
 * The Build 21 review: Step 1's form is one form whether the flow is on or off,
 * so a file given while it is off stays given once Turn on is pressed — as the
 * website's form keeps it. ~~A second form, drawn anew at Turn on, the file
 * gone~~ until the review.
 */
describe('Step 1 keeps the file across Turn on (spec A6; the Build 21 review)', () => {
  it('a paused flow: the file given first is still there after Turn on, and Start run sends it', async () => {
    const entry = invoiceProcessingV3Entry();
    const flow = {
      ...planSubscriptionsPayload().subscriptions[0]!,
      id: 'ip-1',
      templateId: 'invoice-processing',
      templateVersion: entry.version,
      config: { vendor: 'none' },
      unmetConnections: [],
      setup: entry.setup,
      runInput: [{ key: 'invoiceFile', title: 'Document', description: 'A PDF or photo of bills or receipts.', control: 'artifact' as const, required: false }],
      projectId: null,
    };
    let live = false;
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', () => ({
      subscriptions: [{ ...flow, status: live ? ('live' as const) : ('paused' as const) }],
    }));
    fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [entry], categories: ['All'] });
    fake.always('GET /v1/workspaces/{workspaceId}/run-stats', runStatsPayload());
    fake.always('GET /v1/connections/providers', providersWithQuickBooks());
    fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/connections', { connections: [] });
    fake.always('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}', () => {
      live = true;
      return { subscription: { ...flow, status: 'live' as const } };
    });
    fake.always('POST /v1/workspaces/{workspaceId}/runs', { run: { ...runsPayload().runs[0]!, id: 'run-new', status: 'pending' } });
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/receipts.pdf', name: 'receipts.pdf', mimeType: 'application/pdf', size: 5 }] });
    mockSend.mockResolvedValue({ artifactId: 'artifact-1', filename: 'receipts.pdf', contentType: 'application/pdf', sizeBytes: 5 });

    setMockParams({ flow: 'ip-1' });
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('run-file-invoiceFile-upload'));
    expect(await screen.findByText('Ready: receipts.pdf (5 bytes)')).toBeTruthy();
    expect(screen.queryByText('Start run')).toBeNull();

    await fireEvent.press(screen.getByTestId('flow-step-turn-on'));
    expect(await screen.findByText('Start run')).toBeTruthy();
    // The file is still given: no second pick.
    expect(screen.getByText('Ready: receipts.pdf (5 bytes)')).toBeTruthy();
    await fireEvent.press(screen.getByText('Start run'));
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/runs')).toHaveLength(1));
    expect(fake.to('POST /v1/workspaces/{workspaceId}/runs')[0]!.body).toEqual({
      subscriptionId: 'ip-1',
      input: { invoiceFile: 'artifact-1' },
    });
    expect(mockPick).toHaveBeenCalledTimes(1);
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
