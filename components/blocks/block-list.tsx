import React from 'react';
import { View } from 'react-native';

import { space } from '@/constants/theme';
import type { Block } from '@/lib/platform/automations';

import { BadgeBlock } from './badge';
import { ChartBlock } from './chart';
import { Fallback } from './fallback';
import { FileBlock } from './file';
import { GroupCard } from './group';
import { ImageBlock } from './image';
import { LinkBlock } from './link';
import { ListBlock } from './list';
import type { BlockOf, BlockPlace } from './look';
import { MetricBlock } from './metric';
import { QuestionsBlock, questionsForm, type BlockForms } from './questions';
import { SectionBlock } from './section';
import { TableBlock } from './table';
import { TextBlock } from './text';
import { TimelineBlock } from './timeline';

export type { BlockForms } from './questions';

/**
 * What a page hands its blocks: where they are drawn, its own forms, and the
 * workspace it loaded — a picture reads its file there (absent, the active one).
 */
export type BlockContext = BlockPlace & { forms?: BlockForms; workspaceId?: string | null };

/** What every renderer is given: its block, its testID, whether it is inside a section, the page's context and a way to draw a section's blocks. */
type Draw<K extends Block['type']> = (args: {
  block: BlockOf<K>;
  testID: string;
  nested: boolean;
  context: BlockContext;
  inner: (blocks: readonly unknown[], prefix: string) => React.ReactNode;
}) => React.ReactNode;

/**
 * The registry: one renderer for each of the contract's thirteen types (backend
 * ADR-0048 and its amendment 1, `BLOCK_SET_VERSION` 2; ~~ten~~ until Round 21),
 * keyed by the generated union, so a type the contract adds fails the build
 * here until it is drawn (decisions 8 and 12; `__tests__/blocks-render`). Each
 * is made from a part the app already has — the chart from react-native-svg,
 * the picture from React Native's `Image` and the file page's frame
 * (`FileFrame`) — and no new Nocturne primitive.
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
  image: ({ block, testID, nested, context }) => (
    <ImageBlock block={block} testID={testID} nested={nested} place={context} />
  ),
  chart: ({ block, testID, nested }) => <ChartBlock block={block} testID={testID} nested={nested} />,
  group: ({ block, testID, inner }) => <GroupCard block={block} testID={testID} inner={inner} />,
};

/**
 * Whether a block draws nothing at all, so it takes no room: a questions block
 * whose form the page does not offer or draws nothing, an empty list with no
 * empty line.
 */
function drawsNothing(block: unknown, context: BlockContext): boolean {
  if (typeof block !== 'object' || block === null) return false;
  const typed = block as Block;
  if (typed.type === 'questions') return questionsForm(typed, context.forms) === null;
  if (typed.type === 'list') return Array.isArray(typed.items) && typed.items.length === 0 && !typed.empty;
  return false;
}

/** A label block: a title over the block after it (the owner's build 30 note F3). */
function isLabel(block: unknown): boolean {
  return typeof block === 'object' && block !== null && (block as { type?: unknown; style?: unknown }).type === 'text' && (block as { style?: unknown }).style === 'label';
}

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
  // The table's spacing (backend ADR-0048 amendment 1, point 14): `group`
  // between blocks on a page, `inner` inside a section, and a label `title`
  // above the block it heads — as a form's title is above its form — so
  // "ADD CANDIDATE" and "CANDIDATES" sit the same distance above their cards
  // (F3; ~~14 under every block~~ until Round 21). None above the first.
  const between = nested ? space.inner : space.group;
  const drawn = blocks.map((block, index) => ({ block, index })).filter(({ block }) => !drawsNothing(block, context));
  return (
    <View>
      {drawn.map(({ block, index }, at) => {
        const testID = `${prefix}-${index}`;
        const draw = rendererFor(block);
        const above = at === 0 ? 0 : isLabel(drawn[at - 1]!.block) ? space.title : between;
        return (
          <View key={testID} style={above > 0 ? { marginTop: above } : undefined}>
            {draw ? (
              draw({ block: block as Block, testID, nested, context, inner })
            ) : (
              <Fallback testID={`${testID}-fallback`} />
            )}
          </View>
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
