import React from 'react';

import { BlockList, type BlockContext } from '@/components/blocks/block-list';
import { BLOCK_FIXTURES } from '@/lib/generated/platform-contracts/block-fixtures';
import type { Block } from '@/lib/platform/automations';
import { renderWithProviders } from '@/test/render';

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };

/** A host text's words: its string children, nested texts included. */
function words(node: Node | string): string {
  if (typeof node === 'string') return node;
  return (node.children ?? []).map(words).join('');
}

/**
 * The words a page shows, in reading order (backend ADR-0048 decision 9): each
 * host text's words, an empty one left out. A closed section's blocks are not in
 * the tree, so they are left out as the fixtures leave them out; words only a
 * screen reader hears (an `accessibilityLabel`) are not a text's children.
 */
export function visibleWords(tree: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (node === null || node === undefined || typeof node === 'string') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const host = node as Node;
    if (host.type === 'Text') {
      const said = words(host);
      if (said !== '') out.push(said);
      return;
    }
    (host.children ?? []).forEach(walk);
  };
  walk(tree);
  return out;
}

/** Draws blocks as a page does, in the app's providers. */
export function renderBlocks(blocks: readonly unknown[] | undefined, context: BlockContext = {}) {
  return renderWithProviders(<BlockList blocks={blocks} context={context} testID="b" />);
}

/** A block fixture's page body by its name, typed as an answer's `blocks` (the fixtures are the platform's own). */
export function fixtureBlocks(name: string): Block[] {
  const found = BLOCK_FIXTURES.find((fixture) => fixture.name === name);
  if (!found) throw new Error(`No block fixture named ${name}`);
  return found.blocks as Block[];
}

/** A block fixture's visible words, in reading order. */
export function fixtureText(name: string): string[] {
  const found = BLOCK_FIXTURES.find((fixture) => fixture.name === name);
  if (!found) throw new Error(`No block fixture named ${name}`);
  return [...found.text];
}
