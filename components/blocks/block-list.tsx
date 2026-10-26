import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { Block } from '@/lib/platform/automations';

import { BadgeBlock } from './badge';
import { Fallback } from './fallback';
import { FileBlock } from './file';
import { LinkBlock } from './link';
import { ListBlock } from './list';
import type { BlockOf, BlockPlace } from './look';
import { MetricBlock } from './metric';
import { QuestionsBlock, type BlockForms } from './questions';
import { SectionBlock } from './section';
import { TableBlock } from './table';
import { TextBlock } from './text';
import { TimelineBlock } from './timeline';

export type { BlockForms } from './questions';

/** What a page hands its blocks: where they are drawn, and its own forms. */
export type BlockContext = BlockPlace & { forms?: BlockForms };

/** What every renderer is given: its block, its testID, whether it is inside a section, the page's context and a way to draw a section's blocks. */
type Draw<K extends Block['type']> = (args: {
  block: BlockOf<K>;
  testID: string;
  nested: boolean;
  context: BlockContext;
  inner: (blocks: readonly unknown[], prefix: string) => React.ReactNode;
}) => React.ReactNode;

/**
 * The registry: one renderer for each of the contract's ten types, keyed by the
 * generated union, so a type the contract adds fails the build here until it is
 * drawn (backend ADR-0048 decisions 8 and 12; `__tests__/blocks-render`). Each is
 * made from a part the app already has; no new Nocturne primitive.
 */
export const RENDERERS: { [K in Block['type']]: Draw<K> } = {
  text: ({ block, testID }) => <TextBlock block={block} testID={testID} />,
  metric: ({ block, testID }) => <MetricBlock block={block} testID={testID} />,
  badge: ({ block, testID }) => <BadgeBlock block={block} testID={testID} />,
  table: ({ block, testID, nested }) => <TableBlock block={block} testID={testID} nested={nested} />,
  list: ({ block, testID, nested, context }) => (
    <ListBlock block={block} testID={testID} nested={nested} place={context} />
  ),
  section: ({ block, testID, inner }) => <SectionBlock block={block} testID={testID} inner={inner} />,
  file: ({ block, testID, nested, context }) => (
    <FileBlock block={block} testID={testID} nested={nested} place={context} />
  ),
  link: ({ block, testID, nested }) => <LinkBlock block={block} testID={testID} nested={nested} />,
  timeline: ({ block, testID, nested }) => <TimelineBlock block={block} testID={testID} nested={nested} />,
  questions: ({ block, testID, context }) => <QuestionsBlock block={block} testID={testID} forms={context.forms} />,
};

/** The type a block names, when this build draws it; else undefined. */
function rendererFor(block: unknown): Draw<Block['type']> | undefined {
  const type = typeof block === 'object' && block !== null ? (block as { type?: unknown }).type : undefined;
  return typeof type === 'string' && Object.hasOwn(RENDERERS, type)
    ? (RENDERERS[type as Block['type']] as Draw<Block['type']>)
    : undefined;
}

function Blocks({
  blocks,
  prefix,
  nested,
  context,
}: {
  blocks: readonly unknown[];
  prefix: string;
  nested: boolean;
  context: BlockContext;
}) {
  const inner = (within: readonly unknown[], at: string) => (
    <Blocks blocks={within} prefix={at} nested context={context} />
  );
  return (
    <View style={nested ? styles.inner : styles.page}>
      {blocks.map((block, index) => {
        const testID = `${prefix}-${index}`;
        const draw = rendererFor(block);
        return (
          <React.Fragment key={testID}>
            {draw ? (
              draw({ block: block as Block, testID, nested, context, inner })
            ) : (
              <Fallback testID={`${testID}-fallback`} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

/**
 * A page body as the platform sent it (backend ADR-0048): every block drawn as
 * sent and in order, by its type's renderer, its words a text node, never
 * markup; a block, form or target this build does not know drawn as the
 * decision says (`Fallback`, no press). An answer with no blocks — a platform
 * rolled back, or a flow it could not read — draws the fallback alone. Each
 * block's testID is its place: `{testID}-{index}`, and inside a section
 * `{testID}-{index}-{index}`.
 */
export function BlockList({
  blocks,
  context = {},
  testID = 'blocks',
}: {
  blocks: readonly unknown[] | undefined;
  context?: BlockContext;
  testID?: string;
}) {
  if (!Array.isArray(blocks)) {
    return (
      <View testID={testID}>
        <Fallback testID={`${testID}-fallback`} />
      </View>
    );
  }
  return (
    <View testID={testID}>
      <Blocks blocks={blocks} prefix={testID} nested={false} context={context} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  inner: { gap: 8 },
});
