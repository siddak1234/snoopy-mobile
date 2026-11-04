jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key'),
}));

import { fireEvent, screen, within } from '@testing-library/react-native';
import React from 'react';

import DocumentScreen from '@/app/(tabs)/settings/documents';
import OrganizationScreen from '@/app/(tabs)/settings/organization';
import type { WorkspaceDocument } from '@/lib/platform/agreements';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { calendarDate } from '@/lib/view/format';
import { fakePlatform } from '@/test/fake-platform';
import { TEST_WORKSPACE, sessionAs } from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * Round 21 stage 2, C3 (backend ADR-0049): the organization's DOCUMENTS, after
 * ORGANIZATION DETAILS — a row per signed health data agreement, read once
 * with the rest when the screen opens — and one document's read-only copy,
 * read only when its row is opened. The website's "Documents" beside Members,
 * in the same words.
 */

const LIST = 'GET /v1/workspaces/{workspaceId}/documents';
const ONE = 'GET /v1/workspaces/{workspaceId}/documents/{documentId}';
const SIGNED: WorkspaceDocument = {
  id: '00000000-0000-4000-8000-0000000000d2',
  kind: 'health-data',
  version: 2,
  signerName: 'Dana Reyes',
  signerTitle: 'Practice manager',
  acceptedAt: '2026-11-03T15:00:00Z',
};
const EARLIER: WorkspaceDocument = { ...SIGNED, id: '00000000-0000-4000-8000-0000000000d1', version: 1, signerName: 'Ben Ortiz', acceptedAt: '2026-10-01T15:00:00Z' };

beforeEach(() => resetSnapshot());

function routeOrganization(documents: WorkspaceDocument[]) {
  const fake = fakePlatform(platformOperation);
  fake.always('GET /v1/workspaces', {
    workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'owner' }],
    activeWorkspaceId: TEST_WORKSPACE,
  });
  fake.always('GET /v1/workspaces/{workspaceId}/members', { members: [] });
  fake.always('GET /v1/workspaces/{workspaceId}/domains', { domains: [] });
  fake.always('GET /v1/workspaces/{workspaceId}/join-requests', { requests: [] });
  fake.always(LIST, { documents });
  return fake;
}

describe("Organization's DOCUMENTS", () => {
  it('a row per signed agreement, newest first as listed — its version, who accepted it and the day — read once, the copies not read', async () => {
    const fake = routeOrganization([SIGNED, EARLIER]);
    await renderWithProviders(<OrganizationScreen />, sessionAs('owner'));
    const section = within(await screen.findByTestId('organization-documents'));
    expect(section.getByText('DOCUMENTS')).toBeTruthy();
    const rows = section.getAllByText(/^Business Associate Agreement · Version /u).map((row) => row.props.children);
    expect(rows).toEqual(['Business Associate Agreement · Version 2', 'Business Associate Agreement · Version 1']);
    expect(section.getByText(`Accepted by Dana Reyes on ${calendarDate(SIGNED.acceptedAt)}`)).toBeTruthy();
    expect(section.getByText(`Accepted by Ben Ortiz on ${calendarDate(EARLIER.acceptedAt)}`)).toBeTruthy();
    expect(fake.to(LIST)).toEqual([expect.objectContaining({ values: { workspaceId: TEST_WORKSPACE } })]);
    expect(fake.to(ONE)).toEqual([]);
  });

  it('a row opens its copy, by its id', async () => {
    routeOrganization([SIGNED]);
    await renderWithProviders(<OrganizationScreen />, sessionAs('admin'));
    await fireEvent.press(await screen.findByTestId(`document-${SIGNED.id}`));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/settings/documents', params: { document: SIGNED.id } });
  });

  it('none signed: "No documents yet."; a kind this build has no name for is not drawn', async () => {
    routeOrganization([{ ...SIGNED, kind: 'another-kind' }]);
    await renderWithProviders(<OrganizationScreen />, sessionAs('owner'));
    const section = within(await screen.findByTestId('organization-documents'));
    expect(section.getByText('No documents yet.')).toBeTruthy();
    expect(section.queryByText(/Business Associate Agreement/u)).toBeNull();
  });
});

describe('one document, read only', () => {
  it('its title and who accepted it, then the signed copy — read when it opens, nothing to change', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always(ONE, { document: { ...SIGNED, text: 'Covered Entity: Acme Operations\n\nSigned by: Dana Reyes, Practice manager' } });
    setMockParams({ document: SIGNED.id });
    await renderWithProviders(<DocumentScreen />, sessionAs('member'));
    expect(await screen.findByText('Business Associate Agreement · Version 2')).toBeTruthy();
    expect(screen.getByTestId('document-accepted').props.children).toBe(`Accepted by Dana Reyes on ${calendarDate(SIGNED.acceptedAt)}`);
    expect(screen.getByTestId('document-text').props.children).toBe('Covered Entity: Acme Operations\n\nSigned by: Dana Reyes, Practice manager');
    expect(fake.to(ONE)).toEqual([expect.objectContaining({ values: { workspaceId: TEST_WORKSPACE, documentId: SIGNED.id } })]);
    expect(screen.queryByRole('button', { name: /accept|save|delete/iu })).toBeNull();
  });

  it('a kind this build has no name for is not drawn', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always(ONE, { document: { ...SIGNED, kind: 'another-kind', text: 'Another text' } });
    setMockParams({ document: SIGNED.id });
    await renderWithProviders(<DocumentScreen />, sessionAs('owner'));
    expect(await screen.findByTestId('screen-unavailable')).toBeTruthy();
    expect(screen.queryByText('Another text')).toBeNull();
  });
});
