import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import { FlowItems } from '@/components/items/flow-items';
import { BLOCK_WORDS } from '@/lib/generated/platform-contracts/block-rules';
import type { AutomationItems, Item } from '@/lib/platform/automations';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { fakePlatform, type Answer } from '@/test/fake-platform';
import { TEST_WORKSPACE, sessionAs } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn((prefix: string) => `${prefix}-1`),
}));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: {} } }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * A flow's items with search, sort and pages (backend ADR-0048 amendment 1,
 * point 4; owner-words.md rows 2, 5, 8, 9, 13-15): the search box always —
 * "Search {items}", the flow's own word, by title — and a miss says so; over
 * 25 items the sort ("A to Z", today's, or "Newest first") and the pages of
 * 25. The flow's words here are the made-up "Policy" and "Contract".
 */

const FLOW = 'pol-1';
const LISTED = 'GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items' as const;
const DECLARED: AutomationItems = {
  words: { singular: 'Policy', plural: 'Policies' },
  runWords: { singular: 'Contract', plural: 'Contracts' },
  titleField: 'name',
  fields: [{ key: 'name', title: 'Name', control: 'text', required: true }],
  file: { key: 'policyFile', title: 'Policy file', description: 'A PDF.', acceptedContentTypes: ['application/pdf'] },
};

function item(at: number, title: string): Item {
  return {
    id: `i-${at}`,
    subscriptionId: FLOW,
    title,
    fields: { name: title },
    status: 'ready',
    runCount: 0,
    positiveCount: 0,
    negativeCount: 0,
    topScore: null,
    // The first made first: item 30 is the newest.
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, at)).toISOString(),
    createdByUserId: null,
    archivedAt: null,
  };
}

async function open(items: Item[]) {
  const fake = fakePlatform(platformOperation);
  const listed: Answer<typeof LISTED> = { items, choices: {} };
  fake.always(LISTED, listed);
  await renderWithProviders(
    <FlowItems subscriptionId={FLOW} items={DECLARED} shownWorkspaceId={TEST_WORKSPACE} canManage={false} onOpen={() => undefined} />,
    sessionAs('member'),
  );
  await screen.findByTestId('flow-item-i-1');
  return fake;
}

const shown = () => screen.queryAllByTestId(/^flow-item-i-\d+$/u).map((row) => String(row.props.testID).replace('flow-item-', ''));

beforeEach(() => {
  platformOperation.mockReset();
  resetSnapshot();
});

describe("a flow's items: search", () => {
  it('3 items: the search box says "Search policies", finds an item by its title, and a miss says "Nothing matches "…"."', async () => {
    await open([item(1, 'Leases'), item(2, 'Supply'), item(3, 'José Ortiz lease')]);
    const box = screen.getByTestId('flow-items-search');
    expect(box.props.placeholder).toBe('Search policies');
    expect(screen.queryByTestId('flow-items-sort')).toBeNull();
    expect(screen.queryByTestId('flow-items-pager')).toBeNull();
    await fireEvent.changeText(box, 'jose');
    expect(shown()).toEqual(['i-3']);
    await fireEvent.changeText(box, 'LEASE');
    expect(shown()).toEqual(['i-3', 'i-1']);
    await fireEvent.changeText(box, 'zzz');
    expect(shown()).toEqual([]);
    expect(screen.getByTestId('flow-items-no-match').props.children).toBe('Nothing matches "zzz".');
    await fireEvent.press(screen.getByLabelText(BLOCK_WORDS.clearSearch));
    expect(shown()).toEqual(['i-3', 'i-1', 'i-2']);
  });
});

describe("a flow's items: sort and pages over 25", () => {
  const thirty = Array.from({ length: 30 }, (_, at) => item(at + 1, `Policy ${String(at + 1).padStart(2, '0')}`));

  it('30 items: A to Z first, 25 a page; Next and Previous move a page; Newest first sorts by when each was made and goes back to page 1', async () => {
    await open(thirty);
    expect(screen.getByText(BLOCK_WORDS.aToZ)).toBeTruthy();
    expect(shown()).toHaveLength(25);
    expect(shown()[0]).toBe('i-1');
    expect(within(screen.getByTestId('flow-items-pager')).getByText('Page 1 of 2')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('flow-items-pager-next'));
    expect(shown()).toEqual(['i-26', 'i-27', 'i-28', 'i-29', 'i-30']);
    expect(screen.getByText('Page 2 of 2')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('flow-items-pager-previous'));
    expect(shown()[0]).toBe('i-1');
    await fireEvent.press(screen.getByTestId('flow-items-pager-next'));
    // The sort: its menu's second choice.
    await fireEvent.press(screen.getByTestId('flow-items-sort'));
    await fireEvent.press(await screen.findByTestId('flow-items-sort-option-newest'));
    await waitFor(() => expect(shown()[0]).toBe('i-30'));
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();
    expect(screen.getByLabelText(`${BLOCK_WORDS.sort}: ${BLOCK_WORDS.newestFirst}`)).toBeTruthy();
  });

  it('a search over 30 goes back to page 1 and pages what it found', async () => {
    await open(thirty);
    await fireEvent.press(screen.getByTestId('flow-items-pager-next'));
    // Every item still found: page 1 again, not the page it was on.
    await fireEvent.changeText(screen.getByTestId('flow-items-search'), 'policy');
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();
    expect(shown()[0]).toBe('i-1');
    await fireEvent.press(screen.getByTestId('flow-items-pager-next'));
    await fireEvent.changeText(screen.getByTestId('flow-items-search'), 'policy 1');
    expect(shown()).toEqual(['i-10', 'i-11', 'i-12', 'i-13', 'i-14', 'i-15', 'i-16', 'i-17', 'i-18', 'i-19']);
    expect(screen.getByText('Page 1 of 1')).toBeTruthy();
  });
});
