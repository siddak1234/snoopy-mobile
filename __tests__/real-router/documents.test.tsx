import { router } from 'expo-router';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import { WORKSPACE, answerPlatform, flush, launch, signedInOnThisPhone } from '@/test/real-router';

/**
 * A signed document's copy under the real router (Round 21 stage 2, C3;
 * CLAUDE.md rule 11, README "Verification": the params a screen takes on
 * arrival): a screen of Settings, opened from Organization's DOCUMENTS with
 * the document it shows, and Back comes home to Organization.
 */

jest.setTimeout(60_000);

/** Which tab the tab bar shows selected. */
function selectedTab(): string | undefined {
  const bar = screen.getByTestId('tab-bar');
  return within(bar)
    .getAllByRole('tab')
    .find((tab) => tab.props.accessibilityState?.selected)?.props.accessibilityLabel;
}

const DOCUMENT = {
  id: '00000000-0000-4000-8000-0000000000d1',
  kind: 'health-data',
  version: 1,
  signerName: 'Dana Reyes',
  signerTitle: 'Practice manager',
  acceptedAt: '2026-11-03T15:00:00Z',
};

it("Organization's DOCUMENTS row opens the document's copy in Settings with its id, and Back comes home to Organization", async () => {
  signedInOnThisPhone();
  answerPlatform({
    [`/v1/workspaces/${WORKSPACE}/members`]: () => ({ members: [] }),
    [`/v1/workspaces/${WORKSPACE}/domains`]: () => ({ domains: [] }),
    [`/v1/workspaces/${WORKSPACE}/join-requests`]: () => ({ requests: [] }),
    [`/v1/workspaces/${WORKSPACE}/documents`]: () => ({ documents: [DOCUMENT] }),
    [`/v1/workspaces/${WORKSPACE}/documents/${DOCUMENT.id}`]: () => ({ document: { ...DOCUMENT, text: 'The signed copy.' } }),
  });
  const view = await launch();
  await act(async () => router.push('/(tabs)/settings/organization'));
  await flush(100);
  await flush(1000);
  await fireEvent.press(await screen.findByTestId(`document-${DOCUMENT.id}`));
  await flush(100);
  await flush(1000);
  expect(view.getSegments()).toEqual(['(tabs)', 'settings', 'documents']);
  expect(view.getSearchParams()).toMatchObject({ document: DOCUMENT.id });
  expect(selectedTab()).toBe('Settings');
  expect(await screen.findByText('The signed copy.')).toBeTruthy();

  await act(async () => router.back());
  await flush(100);
  await flush(1000);
  expect(view.getPathname()).toBe('/settings/organization');
  expect(await screen.findByTestId('organization-documents')).toBeTruthy();
});
