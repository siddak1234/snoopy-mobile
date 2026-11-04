// Hoisted above the imports by babel-jest: the transport, and the pickers the file field calls.
jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
  putFileToSignedUrl: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import React from 'react';

import { ItemUploadDialog } from '@/components/items/item-upload-dialog';
import type { AutomationItems, Item } from '@/lib/platform/automations';
import { PlatformError } from '@/lib/platform/problem';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { settleAgreement } from '@/lib/view/health-agreement';
import { fakePlatform } from '@/test/fake-platform';
import { TEST_WORKSPACE, sessionAs } from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

const { platformOperation, newIdempotencyKey, putFileToSignedUrl } = jest.requireMock('@/lib/platform/client');

/**
 * Round 21 stage 2, C3 (backend ADR-0049; the review's finding, the session's
 * decision of 2026-11-04): an item's upload starts the run that reads it, so a
 * flow that carries health data refuses it 403 `agreement_required` until the
 * workspace's owner accepted the health data agreement. The owner gets the
 * agreement, as for a run, and the item is sent again under the same key; the
 * upload card steps aside while it is open and comes back as it was. An admin
 * gets the one line; a member is refused first as a member, in the website's
 * words (its a29aa81, by role). The flow here is made up, as no flow's word
 * may be written in the app.
 */

const ASK_OWNER = 'Ask your workspace owner to accept the health data agreement.';
const MEMBER_LINE = 'Only an owner or admin can do this.';
const FLOW = 'pol-1';
const ITEM = 'POST /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items';
const AGREEMENT_FOR_A_RUN = { pathname: '/(tabs)/flows/agreement', params: { action: 'run', workspace: TEST_WORKSPACE } };

const DECLARED: AutomationItems = {
  words: { singular: 'Policy', plural: 'Policies' },
  runWords: { singular: 'Contract', plural: 'Contracts' },
  titleField: 'name',
  groupField: 'region',
  fields: [
    { key: 'region', title: 'Region', control: 'select', options: ['North', 'South'], allowOther: true, defaultValue: 'North', required: true },
    { key: 'name', title: 'Name', control: 'text', maxLength: 60, required: true },
  ],
  file: { key: 'policyFile', title: 'Policy file', description: 'A PDF.', acceptedContentTypes: ['application/pdf'] },
};

const MADE: Item = {
  id: 'i-9',
  subscriptionId: FLOW,
  title: 'Data',
  fields: { region: 'North', name: 'Data' },
  status: 'reading',
  runCount: 0,
  positiveCount: 0,
  negativeCount: 0,
  topScore: null,
  createdAt: '2026-11-04T10:00:00Z',
  createdByUserId: null,
  archivedAt: null,
};

/** 403 `agreement_required`, as the platform answers an item's upload for a flow that carries health data. */
function refusedForAgreement(): never {
  throw new PlatformError('Forbidden', 403, 'FORBIDDEN', { reason: 'agreement_required', kind: 'health-data', version: 1 });
}

beforeEach(() => {
  resetSnapshot();
  settleAgreement(false);
  let n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
  putFileToSignedUrl.mockResolvedValue(undefined);
  (File as unknown as jest.Mock).mockImplementation(() => ({ size: 12, bytes: async () => new Uint8Array(12) }));
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///picked/p.pdf', name: 'p.pdf', mimeType: 'application/pdf', size: 12 }],
  });
});

/** The card open, its name typed and its file sent, Upload not yet pressed. */
async function readyToUpload(role: 'owner' | 'admin' | 'member', fake: ReturnType<typeof fakePlatform>) {
  fake.always('POST /v1/workspaces/{workspaceId}/uploads', {
    uploadSessionId: 'upload-1',
    uploadUrl: 'https://store.example.test/put',
    expiresAt: '2026-11-04T12:00:00Z',
    maximumSizeBytes: 10_000_000,
  });
  fake.always('POST /v1/workspaces/{workspaceId}/uploads/{uploadSessionId}/complete', {
    artifact: { artifactId: 'artifact-1', filename: 'p.pdf', contentType: 'application/pdf', sizeBytes: 12 },
  });
  const onMade = jest.fn();
  await renderWithProviders(
    <ItemUploadDialog
      items={DECLARED}
      choices={{}}
      subscriptionId={FLOW}
      shownWorkspaceId={TEST_WORKSPACE}
      onClose={jest.fn()}
      onMade={onMade}
    />,
    sessionAs(role),
  );
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Data');
  await fireEvent.press(screen.getByTestId('run-file-policyFile-upload'));
  await screen.findByText('Ready: p.pdf (12 bytes)');
  return onMade;
}

describe("an item's upload, refused for the health data agreement", () => {
  it('an owner: the card steps aside and the agreement opens, as for a run; accepted, the item is sent again under the same key and made', async () => {
    const fake = fakePlatform(platformOperation);
    fake.once(ITEM, refusedForAgreement);
    fake.always(ITEM, { item: MADE });
    const onMade = await readyToUpload('owner', fake);
    await fireEvent.press(screen.getByTestId('item-upload-send'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(AGREEMENT_FOR_A_RUN));
    expect(screen.queryByTestId('item-upload-dialog')).toBeNull();
    expect(fake.to(ITEM)).toHaveLength(1);

    await act(async () => settleAgreement(true));
    await waitFor(() => expect(onMade).toHaveBeenCalledWith(MADE));
    const sent = fake.to(ITEM);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.key).toBe(sent[0]!.key);
    expect(sent[1]!.body).toEqual({ fields: { region: 'North', name: 'Data' }, file: 'artifact-1' });
    expect(sent[1]!.body).toEqual(sent[0]!.body);
    expect(screen.queryByText(ASK_OWNER)).toBeNull();
  });

  it('an owner who leaves the agreement: the card comes back as it was, its file still shown, nothing sent and nothing said', async () => {
    const fake = fakePlatform(platformOperation);
    fake.once(ITEM, refusedForAgreement);
    fake.always(ITEM, { item: MADE });
    const onMade = await readyToUpload('owner', fake);
    await fireEvent.press(screen.getByTestId('item-upload-send'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(AGREEMENT_FOR_A_RUN));

    await act(async () => settleAgreement(false));
    expect(await screen.findByTestId('item-upload-dialog')).toBeTruthy();
    expect(screen.getByText('Ready: p.pdf (12 bytes)')).toBeTruthy();
    expect(screen.queryByTestId('item-upload-error')).toBeNull();
    expect(fake.to(ITEM)).toHaveLength(1);
    expect(onMade).not.toHaveBeenCalled();
    // Upload is offered again, with the same file.
    await fireEvent.press(screen.getByTestId('item-upload-send'));
    await waitFor(() => expect(onMade).toHaveBeenCalledWith(MADE));
    expect(fake.to(ITEM)[1]!.body).toEqual({ fields: { region: 'North', name: 'Data' }, file: 'artifact-1' });
  });

  it('an admin (only the owner accepts it): the one line under the form, no agreement, and nothing more sent', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always(ITEM, refusedForAgreement);
    await readyToUpload('admin', fake);
    await fireEvent.press(screen.getByTestId('item-upload-send'));
    expect((await screen.findByTestId('item-upload-error')).props.children).toBe(ASK_OWNER);
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(fake.to(ITEM)).toHaveLength(1);
    expect(screen.queryByText('Forbidden')).toBeNull();
  });

  it("a member (the platform refuses a member first, as a member's, before the agreement): the website's line for it, no agreement, never the owner's line, nothing more sent", async () => {
    const fake = fakePlatform(platformOperation);
    fake.always(ITEM, () => {
      throw new PlatformError('Forbidden', 403, 'FORBIDDEN', { requiredRole: 'admin' });
    });
    await readyToUpload('member', fake);
    await fireEvent.press(screen.getByTestId('item-upload-send'));
    expect((await screen.findByTestId('item-upload-error')).props.children).toBe(MEMBER_LINE);
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(fake.to(ITEM)).toHaveLength(1);
    expect(screen.queryByText(ASK_OWNER)).toBeNull();
    expect(screen.queryByText('Forbidden')).toBeNull();
  });
});
