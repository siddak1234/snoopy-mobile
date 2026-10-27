import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { SurfaceCard } from '@/components/nocturne/surface-card';
import { OpenRow } from '@/components/open-row';
import { pressed } from '@/components/pressable';
import { Text } from '@/components/text';
import { fonts, inset, space, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listChoices } from '@/lib/view/block-sort';

import { Chip } from './badge';
import { httpsLink, openRoute, toneColor, toneOf, type BlockOf, type BlockPlace } from './look';
import { ListTools, NoMatch, Pager, usePaged } from './paged';

type ListItem = BlockOf<'list'>['items'][number];

/** What a screen reader says for a row's score: its label, then the score ("Score 88"). */
const valueLabel = (item: ListItem) => (item.value && item.valueLabel ? `${item.valueLabel} ${item.value}` : undefined);

/**
 * A row's score colour (backend ADR-0048 amendment 1, point 13; the owner's
 * Q5): `valueTone`, which only the platform sets — the positive verdict
 * `success`, the negative `error` — in the tiles' tokens (`toneColor`); no
 * tone, the title's. The row's chip says the verdict's word, so the colour is
 * never the only sign (WCAG 1.4.1).
 */
function valueColor(item: ListItem, palette: Parameters<typeof toneColor>[1]): string | undefined {
  return toneOf(item.valueTone) === 'neutral' ? undefined : toneColor(item.valueTone, palette);
}

/**
 * A row's lines under its title — its subtitle muted, its text, its address —
 * in the block's order. In a row that opens a page, the address is words only:
 * the whole row is the press.
 */
function Lines({ item, link, testID }: { item: ListItem; link: boolean; testID: string }) {
  const { palette } = useTheme();
  const address = link ? httpsLink(item.url) : null;
  return (
    <>
      {item.subtitle ? <Text style={[styles.small, { color: palette.neutral[400] }]}>{item.subtitle}</Text> : null}
      {item.text ? (
        <Text selectable style={[styles.text, { color: palette.text }]}>
          {item.text}
        </Text>
      ) : null}
      {item.url ? (
        address ? (
          <Text
            testID={`${testID}-link`}
            accessibilityRole="link"
            onPress={pressed(() => void Linking.openURL(address.href))}
            suppressHighlighting
            style={[styles.small, { color: palette.accentRamp[300] }]}>
            {item.url}
          </Text>
        ) : (
          <Text selectable style={[styles.small, { color: palette.text }]}>
            {item.url}
          </Text>
        )
      ) : null}
    </>
  );
}

/**
 * An entry (~~`RunSections`' entries~~ until Round 21): its rank, its title in
 * the medium weight, its chip and its score on one line; then its lines, its
 * address a link only when https, opening in the system browser.
 */
function Entry({ item, testID, padded }: { item: ListItem; testID: string; padded: boolean }) {
  const { palette } = useTheme();
  const tone = item.muted ? palette.neutral[400] : palette.text;
  return (
    <View testID={testID} style={[styles.entry, padded && styles.pad]}>
      <View style={styles.line}>
        {item.lead ? <Text style={[styles.lead, { color: palette.neutral[400] }]}>{item.lead}</Text> : null}
        <Text selectable style={[styles.title, { color: tone }]}>
          {item.title}
        </Text>
        {item.badge ? <Chip badge={item.badge} /> : null}
        {item.value ? (
          <Text
            accessibilityLabel={valueLabel(item)}
            style={[styles.value, { color: item.muted ? tone : (valueColor(item, palette) ?? tone) }]}>
            {item.value}
          </Text>
        ) : null}
      </View>
      <Lines item={item} link testID={testID} />
    </View>
  );
}

/**
 * list: each row that opens a page an `OpenRow` — its rank, title, chip and
 * score, its score read as its `valueLabel` ("Score 88") and toned by its
 * `valueTone`, a muted one in the muted tone — the rest entries; an empty list
 * its empty line. A press to a target this build does not know is drawn as an
 * entry, with no press. On a card of its own at the top of a page; inside a
 * section, on the section's. Round 21 (ADR-0048 amendment 1, point 4): the
 * search box always on a `searchable` list (an item's runs), and on any list
 * over 25 rows; over 25, the sort (`BLOCK_WORDS.defaultOrder`, `aToZ`,
 * `highToLow`) and the pages of 25, under the card.
 */
export function ListBlock({
  block,
  testID,
  nested,
  place,
}: {
  block: BlockOf<'list'>;
  testID: string;
  nested: boolean;
  place: BlockPlace;
}) {
  const router = useRouter();
  const { palette } = useTheme();
  const items = block.items;
  const paged = usePaged({
    count: items.length,
    fields: (at) => [items[at]!.title, items[at]!.subtitle],
    choices: listChoices(items),
    searchable: block.searchable === true,
  });
  const Holder = nested ? View : SurfaceCard;
  if (items.length === 0) {
    if (!block.empty) return null;
    return (
      <Holder>
        <Text testID={`${testID}-empty`} style={[styles.empty, !nested && styles.pad, { color: palette.neutral[500] }]}>
          {block.empty}
        </Text>
      </Holder>
    );
  }
  const rows = paged.shown.map((at) => ({ item: items[at]!, at, route: openRoute(items[at]!.open, place) }));
  const opens = items.some((item) => openRoute(item.open, place));
  const card = (
    <Holder>
      <View testID={testID} style={opens ? undefined : [styles.entries, !nested && styles.pad]}>
        {rows.map(({ item, at, route }, index) => {
          const rowID = `${testID}-row-${at}`;
          // Among rows that open, an entry has a row's padding.
          if (!route) return <Entry key={rowID} item={item} testID={rowID} padded={opens} />;
          const more = Boolean(item.subtitle || item.text || item.url);
          return (
            <OpenRow
              key={rowID}
              testID={rowID}
              lead={item.lead}
              title={item.title}
              value={item.value}
              valueTestID={`${rowID}-value`}
              valueAccessibilityLabel={valueLabel(item)}
              valueColor={valueColor(item, palette)}
              badge={item.badge ? <Chip badge={item.badge} /> : undefined}
              below={more ? <Lines item={item} link={false} testID={rowID} /> : undefined}
              muted={item.muted === true}
              divider={index < rows.length - 1}
              onPress={() => router.push(route.href, route.withAnchor ? { withAnchor: true } : undefined)}
            />
          );
        })}
      </View>
    </Holder>
  );
  if (!paged.searchable && !paged.long) return card;
  return (
    <View style={styles.paged}>
      <ListTools paged={paged} testID={testID} />
      {paged.noMatch ? <NoMatch testID={`${testID}-no-match`} text={paged.noMatch} /> : card}
      {paged.long ? <Pager testID={`${testID}-pager`} page={paged.page} pages={paged.pages} onPage={paged.setPage} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  paged: { gap: space.inner },
  entries: { gap: space.inner },
  pad: { paddingVertical: space.rowY, paddingHorizontal: space.rowX },
  entry: { gap: inset.xxs },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.inner },
  lead: { minWidth: 20, fontFamily: fonts.medium, ...typeScale.body },
  title: { flex: 1, minWidth: 0, fontFamily: fonts.medium, ...typeScale.body },
  value: { fontFamily: fonts.medium, ...typeScale.body },
  text: { fontFamily: fonts.regular, ...typeScale.body },
  small: { fontFamily: fonts.regular, ...typeScale.small },
  empty: { fontFamily: fonts.regular, ...typeScale.body },
});
