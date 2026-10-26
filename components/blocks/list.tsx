import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { SurfaceCard } from '@/components/nocturne/surface-card';
import { OpenRow } from '@/components/open-row';
import { pressed } from '@/components/pressable';
import { Text } from '@/components/text';
import { fonts, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Chip } from './badge';
import { httpsLink, openRoute, type BlockOf, type BlockPlace } from './look';

type ListItem = BlockOf<'list'>['items'][number];

/** What a screen reader says for a row's score: its label, then the score ("Score 88"). */
const valueLabel = (item: ListItem) => (item.value && item.valueLabel ? `${item.valueLabel} ${item.value}` : undefined);

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
          <Text accessibilityLabel={valueLabel(item)} style={[styles.value, { color: tone }]}>
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
 * score, its score read as its `valueLabel` ("Score 88"), a muted one in the
 * muted tone — the rest entries; an empty list its empty line. A press to a
 * target this build does not know is drawn as an entry, with no press. On a
 * card of its own at the top of a page; inside a section, on the section's.
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
  const Holder = nested ? View : SurfaceCard;
  if (block.items.length === 0) {
    if (!block.empty) return null;
    return (
      <Holder>
        <Text testID={`${testID}-empty`} style={[styles.empty, !nested && styles.pad, { color: palette.neutral[500] }]}>
          {block.empty}
        </Text>
      </Holder>
    );
  }
  const rows = block.items.map((item) => ({ item, route: openRoute(item.open, place) }));
  const opens = rows.some((row) => row.route);
  return (
    <Holder>
      <View testID={testID} style={opens ? undefined : [styles.entries, !nested && styles.pad]}>
        {rows.map(({ item, route }, index) => {
          const rowID = `${testID}-row-${index}`;
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
}

const styles = StyleSheet.create({
  entries: { gap: 12 },
  pad: { paddingVertical: 13, paddingHorizontal: 14 },
  entry: { gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lead: { minWidth: 20, fontFamily: fonts.medium, ...typeScale.body },
  title: { flex: 1, minWidth: 0, fontFamily: fonts.medium, ...typeScale.body },
  value: { fontFamily: fonts.medium, ...typeScale.body },
  text: { fontFamily: fonts.regular, ...typeScale.body },
  small: { fontFamily: fonts.regular, ...typeScale.small },
  empty: { fontFamily: fonts.regular, ...typeScale.body },
});
