import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { AccessibilityInfo, Linking, StyleSheet, processColor } from 'react-native';

import { RENDERERS } from '@/components/blocks/block-list';
import { httpsLink, openRoute, pageParts, toneOf } from '@/components/blocks/look';
import { Text } from '@/components/text';
import { nocturneDark, status } from '@/constants/theme';
import { FALLBACK } from '@/lib/content/screen-states';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { fileLinkFor, fixtureBlock, fixtureBlocks, renderBlocks, savedFiles, visibleWords } from '@/test/blocks';
import { fakePlatform } from '@/test/fake-platform';
import { TEST_WORKSPACE } from '@/test/platform';
import { mockRouter } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  downloadSignedFile: jest.fn(),
}));
const { platformOperation, downloadSignedFile } = jest.requireMock('@/lib/platform/client');

/**
 * The thirteen blocks (backend ADR-0048 and its amendment 1, `BLOCK_SET_VERSION`
 * 2; ~~ten~~ until Round 21), each drawn by its renderer (decisions 8–10):
 * its words, its tone a theme token, open or closed, and its press; and what
 * this build does not know — a type, a form, a target, a tone, a state —
 * drawn as the decision says, never thrown.
 */

const color = (node: { props: { style?: unknown } }) => (StyleSheet.flatten(node.props.style as never) as { color?: string } | undefined)?.color;
const RUN = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
const FILE = '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c';
const ITEM = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b';

describe('the registry', () => {
  it('has one renderer for each type the contract names, and no other', () => {
    // The generated union's members, read from the generated contract itself.
    const generated = readFileSync(resolve(__dirname, '../lib/generated/platform-contracts/automations.d.ts'), 'utf8');
    const union = generated.slice(generated.indexOf('        Block: {'), generated.indexOf('        FlowPages: {'));
    // Each type once: a group's sections name `section` again.
    const types = [...new Set([...union.matchAll(/\/\*\* @constant \*\/\n\s+type: "(\w+)";/gu)].map((match) => match[1]))];
    expect(types).toHaveLength(13);
    expect(types).toEqual(expect.arrayContaining(['image', 'chart', 'group']));
    expect(Object.keys(RENDERERS).sort()).toEqual([...types].sort());
  });
});

describe('text', () => {
  it('a label is a heading in capitals; strong is medium; muted small and muted; a tone its token, an error an alert', async () => {
    await renderBlocks([
      { type: 'text', text: 'Documents', style: 'label' },
      { type: 'text', text: 'Bill · Harbor', style: 'strong' },
      { type: 'text', text: '18 Dock St', style: 'muted' },
      { type: 'text', text: 'Saved.', tone: 'success' },
      { type: 'text', text: 'Waiting.', tone: 'warning' },
      { type: 'text', text: 'It failed.', tone: 'error' },
      { type: 'text', text: 'Plain.', tone: 'purple' },
    ]);
    const label = screen.getByText('Documents');
    expect(StyleSheet.flatten(label.props.style).textTransform).toBe('uppercase');
    expect(screen.getByTestId('b-0').props.accessibilityRole).toBe('header');
    expect(StyleSheet.flatten(screen.getByText('Bill · Harbor').props.style).fontFamily).toBe('Inter_500Medium');
    expect(color(screen.getByText('18 Dock St'))).toBe(nocturneDark.neutral[400]);
    expect(color(screen.getByText('Saved.'))).toBe(status.ok);
    expect(color(screen.getByText('Waiting.'))).toBe(status.warnText);
    expect(color(screen.getByText('It failed.'))).toBe(status.err);
    expect(screen.getByText('It failed.').props.accessibilityRole).toBe('alert');
    // A tone this build does not know: neutral, the text's.
    expect(color(screen.getByText('Plain.'))).toBe(nocturneDark.text);
    expect(screen.getByText('Plain.').props.accessibilityRole).toBeUndefined();
  });
});

describe('metric and badge', () => {
  it('each value over its label, toned; a badge the chip in its tone, an unknown one neutral', async () => {
    await renderBlocks([
      { type: 'metric', items: [{ label: 'Total', value: '3' }, { label: 'Advance', value: '1', tone: 'success' }, { label: 'Decline', value: '1', tone: 'error' }] },
      { type: 'badge', text: 'Not approved', tone: 'error' },
      { type: 'badge', text: 'Odd', tone: 'sparkle' },
    ]);
    expect(visibleWords(screen.toJSON())).toEqual(['3', 'Total', '1', 'Advance', '1', 'Decline', 'Not approved', 'Odd']);
    const tiles = within(screen.getByTestId('b-0'));
    expect(color(tiles.getByText('3'))).toBe(nocturneDark.text);
    expect(tiles.getAllByText('1').map(color)).toEqual([status.ok, status.err]);
    expect(color(screen.getByText('Not approved'))).toBe(status.err);
    expect(color(screen.getByText('Odd'))).toBe(nocturneDark.neutral[400]);
  });
});

describe('table', () => {
  it('its column titles, then each row: cells to their side, a muted column muted, a strong row medium, a note under it, rules when divided', async () => {
    await renderBlocks([
      {
        type: 'table',
        columns: [{ title: 'Check', muted: true }, { title: 'Result', align: 'end' }],
        rows: [
          { cells: ['Totals add up', 'Yes'] },
          { cells: ['Total', '$102.60'], strong: true, note: 'Read from the header.' },
          { cells: ['Empty', ''] },
        ],
        divided: true,
      },
    ]);
    expect(visibleWords(screen.toJSON())).toEqual(['Check', 'Result', 'Totals add up', 'Yes', 'Total', '$102.60', 'Read from the header.', 'Empty']);
    expect(color(screen.getByText('Totals add up'))).toBe(nocturneDark.neutral[400]);
    expect(StyleSheet.flatten(screen.getByText('Yes').props.style).textAlign).toBe('right');
    expect(StyleSheet.flatten(screen.getByText('$102.60').props.style).fontFamily).toBe('Inter_500Medium');
    expect(StyleSheet.flatten(screen.getByTestId('b-0-row-0').props.style)?.borderTopWidth).toBeUndefined();
    expect(StyleSheet.flatten(screen.getByTestId('b-0-row-1').props.style).borderTopWidth).toBe(1);
  });
});

describe('list', () => {
  it('a ranked run: its rank, title, score — read "Score 88" — a failed one muted; each row opens its run', async () => {
    await renderBlocks([
      {
        type: 'list',
        items: [
          { lead: '1', title: 'Dana Whitfield', value: '88', valueLabel: 'Score', open: { target: 'run', runId: 'r1' } },
          { lead: '2', title: 'Failed', muted: true, open: { target: 'run', runId: 'r2' } },
        ],
      },
    ]);
    expect(screen.getByTestId('b-0-row-0-value').props.accessibilityLabel).toBe('Score 88');
    expect(color(screen.getByText('Failed'))).toBe(nocturneDark.neutral[400]);
    await fireEvent.press(screen.getByTestId('b-0-row-0'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/(tabs)/activity/run', params: { runId: 'r1' } }, undefined);
    await fireEvent.press(screen.getByTestId('b-0-row-1'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/(tabs)/activity/run', params: { runId: 'r2' } }, undefined);
  });

  it('from an item, a run opens in Activity over its anchor and says it came from Flows', async () => {
    await renderBlocks([{ type: 'list', items: [{ title: 'Omar', open: { target: 'run', runId: 'r2' } }] }], { runOrigin: 'flows' });
    await fireEvent.press(screen.getByTestId('b-0-row-0'));
    expect(mockRouter.push).toHaveBeenCalledWith(
      { pathname: '/(tabs)/activity/run', params: { runId: 'r2', returnTo: 'flows' } },
      { withAnchor: true },
    );
  });

  it('a row that opens with more to say: its chip and score on its line, then subtitle, text and address — the address words, the row the press', async () => {
    await renderBlocks([
      {
        type: 'list',
        items: [
          {
            title: 'Contract',
            badge: { text: 'Found', tone: 'success' },
            value: '7',
            valueLabel: 'Score',
            subtitle: 'Line 1',
            text: 'Read twice.',
            url: 'https://example.test/x',
            open: { target: 'run-file', runId: RUN, fileId: FILE },
          },
        ],
      },
    ]);
    expect(visibleWords(screen.toJSON())).toEqual(['Contract', 'Found', '7', 'Line 1', 'Read twice.', 'https://example.test/x']);
    expect(screen.queryByTestId('b-0-row-0-link')).toBeNull();
    await fireEvent.press(screen.getByTestId('b-0-row-0'));
    expect(mockRouter.push).toHaveBeenCalledWith(
      { pathname: '/(tabs)/activity/run-file', params: { runId: RUN, fileId: FILE } },
      undefined,
    );
  });

  it('entries: title, chip, subtitle, text; an https address a link to the system browser, an http one words only', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    try {
      await renderBlocks([
        {
          type: 'list',
          items: [
            { title: 'B.S. Accounting', url: 'https://school.example.test/accounting' },
            { title: 'Old page', url: 'http://plain.example.test/' },
            { title: 'Payroll Lead', subtitle: 'Fernwood Foods', text: 'Ran payroll.', badge: { text: 'Found', tone: 'success' } },
          ],
        },
      ]);
      expect(visibleWords(screen.toJSON())).toEqual([
        'B.S. Accounting',
        'https://school.example.test/accounting',
        'Old page',
        'http://plain.example.test/',
        'Payroll Lead',
        'Found',
        'Fernwood Foods',
        'Ran payroll.',
      ]);
      await fireEvent.press(screen.getByTestId('b-0-row-0-link'));
      expect(open).toHaveBeenCalledWith('https://school.example.test/accounting');
      expect(screen.queryByTestId('b-0-row-1-link')).toBeNull();
      expect(screen.getByText('http://plain.example.test/').props.onPress).toBeUndefined();
    } finally {
      open.mockRestore();
    }
  });

  it('an empty list says its empty line; one with none says nothing', async () => {
    await renderBlocks([
      { type: 'list', items: [], empty: 'No candidates yet.' },
      { type: 'list', items: [] },
    ]);
    expect(visibleWords(screen.toJSON())).toEqual(['No candidates yet.']);
  });
});

describe('section', () => {
  it('each on its own card, closed unless open, each opening and closing on its own', async () => {
    await renderBlocks([
      { type: 'section', title: 'Invoice 1 of 2', subtitle: 'Harbor · $102.60', badge: { text: 'Recorded', tone: 'success' }, blocks: [{ type: 'text', text: 'Inside one' }] },
      { type: 'section', title: 'Experience', open: true, blocks: [{ type: 'text', text: 'Inside two' }] },
    ]);
    expect(screen.queryByText('Inside one')).toBeNull();
    expect(screen.getByText('Inside two')).toBeTruthy();
    expect(screen.getByTestId('b-0-toggle').props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.getByTestId('b-0-toggle').props.accessibilityLabel).toBe('Invoice 1 of 2, Harbor · $102.60, Recorded');
    expect(color(screen.getByTestId('b-0-badge'))).toBe(status.ok);
    await fireEvent.press(screen.getByTestId('b-0-toggle'));
    expect(screen.getByText('Inside one')).toBeTruthy();
    expect(screen.getByText('Inside two')).toBeTruthy();
    expect(screen.getByTestId('b-0-toggle').props.accessibilityState).toMatchObject({ expanded: true });
    await fireEvent.press(screen.getByTestId('b-1-toggle'));
    expect(screen.queryByText('Inside two')).toBeNull();
    expect(screen.getByText('Inside one')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('b-0-toggle'));
    expect(screen.queryByText('Inside one')).toBeNull();
  });

  it.each([
    [false, 'grows and fades in'],
    [true, 'opens still under Reduce Motion'],
  ])('Reduce Motion %s: it %s', async (reduced) => {
    const motion = AccessibilityInfo.isReduceMotionEnabled as jest.Mock;
    const asItWas = motion.getMockImplementation();
    motion.mockResolvedValue(reduced);
    try {
      await renderBlocks([{ type: 'section', title: 'S', blocks: [{ type: 'text', text: 'In' }] }]);
      await act(async () => {
        await new Promise((settle) => setTimeout(settle, 10));
      });
      await fireEvent.press(screen.getByTestId('b-0-toggle'));
      const body = screen.getByTestId('b-0-body');
      if (reduced) {
        expect(body.props.entering).toBeUndefined();
        expect(screen.getByTestId('b-0').props.layout).toBeUndefined();
      } else {
        expect(body.props.entering).toBeDefined();
        expect(screen.getByTestId('b-0').props.layout).toBeDefined();
      }
    } finally {
      motion.mockImplementation(asItWas);
    }
  });
});

describe('file and link', () => {
  it('a file: its title alone, opening its page — a run\'s file or an item\'s', async () => {
    await renderBlocks([
      { type: 'file', title: 'View resume', open: { target: 'run-file', runId: RUN, fileId: FILE } },
      { type: 'file', title: 'Job description', open: { target: 'item-file', itemId: ITEM } },
    ]);
    expect(visibleWords(screen.toJSON())).toEqual(['View resume', 'Job description']);
    await fireEvent.press(screen.getByTestId('b-0'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/(tabs)/activity/run-file', params: { runId: RUN, fileId: FILE } }, undefined);
    await fireEvent.press(screen.getByTestId('b-1'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/(tabs)/flows/item-file', params: { item: ITEM } }, undefined);
  });

  it('a link: its title, its host muted under it, opening in the system browser; an http one its title alone, no press', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    try {
      await renderBlocks([
        { type: 'link', title: 'Where the rules live', url: 'https://help.example.test/rules' },
        { type: 'link', title: 'Not safe', url: 'http://help.example.test/rules' },
      ]);
      expect(visibleWords(screen.toJSON())).toEqual(['Where the rules live', 'help.example.test', 'Not safe']);
      expect(color(screen.getByText('help.example.test'))).toBe(nocturneDark.neutral[400]);
      await fireEvent.press(screen.getByTestId('b-0'));
      expect(open).toHaveBeenCalledWith('https://help.example.test/rules');
      expect(screen.getByTestId('b-1').props.onPress).toBeUndefined();
    } finally {
      open.mockRestore();
    }
  });

  it('https only, as the platform checks it: no user, no password, a host', () => {
    expect(httpsLink('https://a.test/x')).toEqual({ href: 'https://a.test/x', host: 'a.test' });
    for (const bad of ['http://a.test/', 'https://me:pw@a.test/', 'https://me@a.test/', 'javascript:alert(1)', 'not a url', 7, undefined])
      expect(httpsLink(bad)).toBeNull();
  });
});

describe('timeline', () => {
  it('each step its title and line, in its state\'s look; a state this build does not know, "unknown"\'s', async () => {
    await renderBlocks([
      {
        type: 'timeline',
        items: [
          { title: 'Read', state: 'done' },
          { title: 'Check', sub: 'One left', state: 'working' },
          { title: 'Later', state: 'teleported' },
        ],
      },
    ]);
    expect(visibleWords(screen.toJSON())).toEqual(['Read', 'Check', 'One left', 'Later']);
    expect(screen.getByTestId('run-step-spinner')).toBeTruthy();
    expect(color(screen.getByText('Later'))).toBe(nocturneDark.neutral[400]);
    expect(color(screen.getByText('Read'))).toBe(nocturneDark.text);
  });
});

describe('questions', () => {
  it('each form by the page\'s own component; a form the page does not offer, nothing; one this build does not know, the fallback', async () => {
    const forms = { approval: jest.fn((form: { approvalId?: string }) => <Text>{`Decide ${form.approvalId}`}</Text>) };
    await renderBlocks(
      [
        { type: 'questions', form: { kind: 'approval', approvalId: 'a1', eligibleRoles: ['owner'] } },
        { type: 'questions', form: { kind: 'run', itemId: ITEM } },
        { type: 'questions', form: { kind: 'survey' } },
      ],
      { forms },
    );
    expect(forms.approval).toHaveBeenCalledWith({ kind: 'approval', approvalId: 'a1', eligibleRoles: ['owner'] });
    expect(visibleWords(screen.toJSON())).toEqual(['Decide a1', FALLBACK]);
  });
});

describe('list: the verdict\'s colour and word (ADR-0048 amendment 1, point 13; the owner\'s Q5, F2)', () => {
  it('a positive row\'s score is green with "Advance", a negative one red with "Decline", no verdict plain and no chip', async () => {
    await renderBlocks(fixtureBlocks('reviewer-item-verdicts'));
    expect(visibleWords(screen.toJSON())).toEqual(['1', 'Dana Whitfield', 'Advance', '88', '2', 'Mara Quinn', '63', '3', 'Omar Reyes', 'Decline', '41']);
    expect(color(screen.getByTestId('b-0-row-0-value'))).toBe(status.ok);
    expect(color(screen.getByText('Advance'))).toBe(status.ok);
    expect(color(screen.getByTestId('b-0-row-2-value'))).toBe(status.err);
    expect(color(screen.getByText('Decline'))).toBe(status.err);
    expect(color(screen.getByTestId('b-0-row-1-value'))).toBe(nocturneDark.text);
    expect(within(screen.getByTestId('b-0-row-1')).queryAllByText(/Advance|Decline/u)).toHaveLength(0);
  });

  it('a failed row stays muted whatever its tone', async () => {
    await renderBlocks([
      { type: 'list', items: [{ title: 'Failed', value: '40', valueLabel: 'Score', valueTone: 'success', muted: true, open: { target: 'run', runId: 'r9' } }] },
    ]);
    expect(color(screen.getByTestId('b-0-row-0-value'))).toBe(nocturneDark.neutral[400]);
  });
});

describe('image (ADR-0048 amendment 1, point 2)', () => {
  beforeEach(() => {
    platformOperation.mockReset();
    resetSnapshot();
  });

  it('its source is the typed target\'s file, from its signed link — never an address in the block, a planted url ignored', async () => {
    const saved = savedFiles(downloadSignedFile);
    const fake = fakePlatform(platformOperation);
    const block = fixtureBlock('drawn-image', 'image');
    fake.always('GET /v1/workspaces/{workspaceId}/runs/{runId}/files/{fileId}', fileLinkFor(block.file));
    await renderBlocks([{ ...block, url: 'https://evil.example/tracker.png', src: 'https://evil.example/x.png' }], { workspaceId: TEST_WORKSPACE });
    const image = await screen.findByTestId('b-0-picture');
    expect(image.props.source).toEqual({ uri: saved[0]!.uri });
    expect(downloadSignedFile).toHaveBeenCalledTimes(1);
    expect(downloadSignedFile.mock.calls[0]![0]).toBe(`https://files.example.com/${block.file.id}`);
    expect(JSON.stringify(downloadSignedFile.mock.calls)).not.toContain('evil.example');
    expect(JSON.stringify(image.props)).not.toContain('evil.example');
  });
});

describe('chart (ADR-0048 amendment 1, point 3)', () => {
  it('a bar chart is one image read as its alt; each bar value / max of its track, in the accent; its words text nodes', async () => {
    const block = fixtureBlock('drawn-chart-bar', 'chart');
    await renderBlocks([block]);
    const box = screen.getByTestId('b-0');
    expect(box.props.accessible).toBe(true);
    expect(box.props.accessibilityRole).toBe('image');
    expect(box.props.accessibilityLabel).toBe(block.alt);
    const max = Math.max(...block.points.map((point) => point.value));
    block.points.forEach((point, at) => {
      const bar = screen.getByTestId(`b-0-bar-${at}-value`);
      expect(bar.props.width).toBe(`${(point.value / max) * 100}%`);
      expect(bar.props.fill).toEqual({ payload: processColor(nocturneDark.accent), type: 0 });
    });
    expect(visibleWords(screen.toJSON())).toEqual(['Spend by vendor', 'Harbor Paper Co.', '$1,204.50', 'Cedar Office Supply', '$980.00', 'Pine Street Print', '312']);
  });

  it('a line chart takes its width from its layout, a dot at each of 24 points or fewer and none past them', async () => {
    const block = fixtureBlock('drawn-chart-line', 'chart');
    await renderBlocks([block, { ...block, points: Array.from({ length: 30 }, (_, at) => ({ label: `W${at}`, value: at, text: String(at) })) }]);
    expect(screen.getByTestId('b-0').props.accessibilityLabel).toBe(block.alt);
    expect(screen.queryByTestId('b-0-line')).toBeNull();
    for (const plot of ['b-0-plot', 'b-1-plot']) {
      await fireEvent(screen.getByTestId(plot), 'layout', { nativeEvent: { layout: { width: 300, height: 120 } } });
    }
    expect(screen.getByTestId('b-0-line')).toBeTruthy();
    expect(screen.queryAllByTestId(/^b-0-dot-/u)).toHaveLength(6);
    expect(screen.getByTestId('b-1-line')).toBeTruthy();
    expect(screen.queryAllByTestId(/^b-1-dot-/u)).toHaveLength(0);
  });
});

describe('group (ADR-0048 amendment 1, point 12; the owner\'s Q6, F6)', () => {
  it('its title, then one card of its sections as drop-downs with dividers: the first open, several open at once', async () => {
    const blocks = fixtureBlocks('reviewer-candidate-grouped');
    await renderBlocks(blocks);
    expect(screen.getByTestId('b-1-title').props.accessibilityRole).toBe('header');
    const card = screen.getByTestId('b-1-card');
    // One card: both sections inside it, a divider above the second.
    expect(within(card).getByTestId('b-1-0-toggle')).toBeTruthy();
    expect(within(card).getByTestId('b-1-1-toggle')).toBeTruthy();
    expect(screen.getByTestId('b-1-0-toggle').props.accessibilityState).toEqual({ expanded: true });
    expect(screen.getByTestId('b-1-1-toggle').props.accessibilityState).toEqual({ expanded: false });
    expect(screen.queryByTestId('b-1-1-body')).toBeNull();
    await fireEvent.press(screen.getByTestId('b-1-1-toggle'));
    expect(screen.getByTestId('b-1-0-body')).toBeTruthy();
    expect(screen.getByTestId('b-1-1-body')).toBeTruthy();
    const parts = card.children as unknown as { props: { style?: unknown } }[];
    expect(parts.map((part) => (StyleSheet.flatten(part.props.style as never) as { borderTopWidth?: number } | undefined)?.borderTopWidth)).toEqual([undefined, 1]);
  });
});

describe("the spacing table between blocks (ADR-0048 amendment 1, point 14; the owner's Q8, F3)", () => {
  const flat = (node: { props: { style?: unknown } }) => (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, number | undefined>;

  it('"ADD CANDIDATE" (a form\'s title) and "CANDIDATES" (a label) sit the same `title` above what they head; `group` between blocks; none above the first', async () => {
    await renderBlocks(fixtureBlocks('reviewer-item'), { forms: { run: () => <Text testID="the-form">form</Text> } });
    // The form's title: a header, `title` (8) under it, one em tall.
    const formTitle = screen.getByTestId('b-2-title');
    expect(formTitle.props.accessibilityRole).toBe('header');
    expect(flat(formTitle).marginBottom).toBe(8);
    expect(flat(within(formTitle).getByText('Add candidate')).lineHeight).toBe(13);
    // The label: a header with no gap of its own; the list after it sits `title` below it.
    const label = screen.getByTestId('b-3');
    expect(label.props.accessibilityRole).toBe('header');
    expect(flat(label).marginBottom).toBeUndefined();
    expect(flat(within(label).getByText('Candidates')).lineHeight).toBe(13);
    const gapAbove = (id: string) => {
      // The block list's own wrapper is the nearest ancestor that sets a marginTop, if any.
      let node = screen.getByTestId(id).parent as unknown as { props: { style?: unknown }; parent?: unknown } | null;
      for (let up = 0; node && up < 4; up += 1) {
        const top = flat(node).marginTop;
        if (top !== undefined) return top;
        node = node.parent as typeof node;
      }
      return undefined;
    };
    expect(gapAbove('b-4')).toBe(8);
    expect(gapAbove('b-1')).toBe(16);
    expect(gapAbove('b-3')).toBe(16);
    expect(gapAbove('b-0')).toBeUndefined();
  });
});

describe('what this build does not know', () => {
  it('a type at the top and inside a section, a form, and no blocks at all each draw the one sentence; a target draws with no press', async () => {
    await renderBlocks([
      { type: 'gauge', points: [1, 2] },
      { type: 'section', title: 'Inside', open: true, blocks: [{ type: 'gauge' }, { type: 'questions', form: { kind: 'poll' } }] },
      { type: 'list', items: [{ title: 'Opens nothing here', open: { target: 'invoice', invoiceId: 'x' } }] },
      { type: 'file', title: 'Somewhere', open: { target: 'vault' } },
      { type: 'file', title: 'No id', open: { target: 'run-file', runId: RUN } },
      null,
      7,
      { type: 5 },
      { type: 'constructor' },
    ]);
    expect(visibleWords(screen.toJSON())).toEqual([
      FALLBACK,
      'Inside',
      FALLBACK,
      FALLBACK,
      'Opens nothing here',
      'Somewhere',
      'No id',
      FALLBACK,
      FALLBACK,
      FALLBACK,
      FALLBACK,
    ]);
    expect(screen.getByTestId('b-2-row-0').props.onPress).toBeUndefined();
    expect(screen.getByTestId('b-3').props.onPress).toBeUndefined();
    expect(screen.getByTestId('b-4').props.onPress).toBeUndefined();
  });

  it('a page whose blocks did not come draws the fallback alone', async () => {
    await renderBlocks(undefined);
    expect(visibleWords(screen.toJSON())).toEqual([FALLBACK]);
  });

  it('a tone is neutral, a target null, a page part null — never thrown', () => {
    expect(toneOf('sparkle')).toBe('neutral');
    expect(toneOf(undefined)).toBe('neutral');
    expect(openRoute({ target: 'invoice' } as never, {})).toBeNull();
    expect(openRoute(undefined, {})).toBeNull();
    expect(openRoute({ target: 'item-file' } as never, {})).toBeNull();
    expect(pageParts(['viewer', 'map', 'reading'], ['viewer', 'reading'] as const, ['viewer'])).toEqual(['viewer', null, 'reading']);
    expect(pageParts(undefined, ['viewer', 'reading'] as const, ['viewer', 'reading'])).toEqual(['viewer', 'reading']);
  });
});
