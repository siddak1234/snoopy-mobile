import { ArrowsDownUp, MagnifyingGlass, X } from 'phosphor-react-native';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Dropdown } from '@/components/dropdown';
import { PillButton } from '@/components/nocturne/pill-button';
import { Pressable } from '@/components/pressable';
import { ScopePill } from '@/components/scope-control';
import { Text, TextInput } from '@/components/text';
import { fonts, radius, space, typeScale, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { BLOCK_WORDS } from '@/lib/generated/platform-contracts/block-rules';
import {
  DEFAULT_ORDER,
  QUERY_LENGTH,
  fill,
  isLong,
  pageCount,
  pageRows,
  pageWithin,
  search,
  sortedIndexes,
  type SortChoice,
} from '@/lib/view/block-sort';

/**
 * Search, sort and pages (backend ADR-0048 amendment 1, point 4; the owner's
 * words rows 1–16, every one `BLOCK_WORDS`'): one search box, one sort
 * drop-down and one pager, the same on a flow's items, an item's runs,
 * Activity and a long list or table in a run's blocks — the website's
 * `Paged.tsx`. The search box is the Flows tab's (~~drawn there alone~~ until
 * Round 21); a new search or a new sort goes back to page 1.
 */

/** The search box: the glass, the glass's magnifier, the hint (`BLOCK_WORDS.search`, `searchItems`); × clears it (`clearSearch`). */
export function SearchBox({
  value,
  onChange,
  placeholder,
  testID,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={[styles.search, { borderColor: palette.neutral[800], backgroundColor: withAlpha(palette.surface, 0.6) }]}>
      <MagnifyingGlass size={17} color={palette.neutral[500]} />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={(next) => onChange(next.slice(0, QUERY_LENGTH))}
        placeholder={placeholder}
        placeholderTextColor={palette.neutral[500]}
        selectionColor={palette.accent}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        maxLength={QUERY_LENGTH}
        style={[styles.searchInput, { color: palette.text }]}
      />
      {value !== '' ? (
        <Pressable
          testID={`${testID}-clear`}
          accessibilityRole="button"
          accessibilityLabel={BLOCK_WORDS.clearSearch}
          hitSlop={space.inner}
          onPress={() => onChange('')}>
          <X size={15} color={palette.neutral[500]} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** The sort drop-down: its choice's words on the pill, read aloud after `BLOCK_WORDS.sort`. */
export function SortControl({
  choices,
  value,
  onChange,
  testID,
}: {
  choices: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  testID: string;
}) {
  const [open, setOpen] = useState(false);
  const label = choices.find((choice) => choice.value === value)?.label ?? choices[0]?.label ?? '';
  return (
    <View style={styles.sortRow}>
      <Dropdown
        testID={testID}
        title={BLOCK_WORDS.sort}
        options={choices.map((choice) => ({ value: choice.value, label: choice.label }))}
        value={value}
        open={open}
        onOpenChange={setOpen}
        onChange={(next) => {
          onChange(next);
          setOpen(false);
        }}
        trigger={
          <ScopePill
            testID={testID}
            icon={ArrowsDownUp}
            label={label}
            accessibilityLabel={`${BLOCK_WORDS.sort}: ${label}`}
            onPress={() => setOpen(true)}
          />
        }
      />
    </View>
  );
}

/** The pager: `BLOCK_WORDS.previous`, `pageOf`, `next` — read aloud as `previousPage` and `nextPage`. */
export function Pager({
  page,
  pages,
  onPage,
  testID,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <View testID={testID} style={styles.pager}>
      <PillButton
        testID={`${testID}-previous`}
        label={BLOCK_WORDS.previous}
        accessibilityLabel={BLOCK_WORDS.previousPage}
        variant="secondary"
        fontSize={typeScale.body.fontSize}
        disabled={page <= 1}
        onPress={() => onPage(page - 1)}
      />
      <Text testID={`${testID}-page`} style={[styles.pageOf, { color: palette.neutral[400] }]}>
        {fill(BLOCK_WORDS.pageOf, { n: page, total: pages })}
      </Text>
      <PillButton
        testID={`${testID}-next`}
        label={BLOCK_WORDS.next}
        accessibilityLabel={BLOCK_WORDS.nextPage}
        variant="secondary"
        fontSize={typeScale.body.fontSize}
        disabled={page >= pages}
        onPress={() => onPage(page + 1)}
      />
    </View>
  );
}

/** What a list shows on the phone: the page's rows (by index into the rows sent), and the tools' state. */
export type Paged = {
  /** The rows to draw, as indexes into the rows given, in the chosen order. */
  shown: number[];
  /** Whether the search box shows: always when `searchable`, else only when long. */
  searchable: boolean;
  /** Whether sort and pages show: only when long. */
  long: boolean;
  query: string;
  setQuery: (query: string) => void;
  sort: string;
  setSort: (sort: string) => void;
  choices: readonly SortChoice[];
  page: number;
  pages: number;
  setPage: (page: number) => void;
  /** The search found nothing: `BLOCK_WORDS.noMatch`, filled. */
  noMatch: string | null;
};

/**
 * Search, sort and pages over rows held on the phone (a list or table block, a
 * flow's items): the search over each row's `fields`, then the chosen sort,
 * then page `page` of 25. Searchable always when `searchable` (an item's runs,
 * a flow's items), otherwise only when long; sort and pages only when long.
 */
export function usePaged({
  count,
  fields,
  choices,
  searchable = false,
}: {
  count: number;
  fields: (at: number) => readonly (string | undefined | null)[];
  choices: readonly SortChoice[];
  searchable?: boolean;
}): Paged {
  const [query, setQueryState] = useState('');
  const [sort, setSortState] = useState(DEFAULT_ORDER);
  const [page, setPage] = useState(1);
  const long = isLong(count);
  const canSearch = searchable || long;
  const choice = choices.find((each) => each.value === sort) ?? choices[0];
  const ordered = useMemo(
    () => (long && choice ? sortedIndexes(count, choice) : Array.from({ length: count }, (_, at) => at)),
    [choice, count, long],
  );
  const found = canSearch ? search(ordered, query, fields) : ordered;
  const pages = long ? pageCount(found.length) : 1;
  const at = pageWithin(page, found.length);
  const shown = long ? pageRows(found, at) : found;
  return {
    shown,
    searchable: canSearch,
    long,
    query,
    setQuery: (next) => {
      setQueryState(next);
      setPage(1);
    },
    sort: choice?.value ?? DEFAULT_ORDER,
    setSort: (next) => {
      setSortState(next);
      setPage(1);
    },
    choices,
    page: at,
    pages,
    setPage,
    noMatch: count > 0 && found.length === 0 ? fill(BLOCK_WORDS.noMatch, { query: query.trim() }) : null,
  };
}

/**
 * The tools above a list, as `usePaged` holds them: the search box (`hint`,
 * `BLOCK_WORDS.search` unless the page names its rows) and, on a long list,
 * the sort.
 */
export function ListTools({ paged, testID, hint = BLOCK_WORDS.search }: { paged: Paged; testID: string; hint?: string }) {
  if (!paged.searchable && !paged.long) return null;
  return (
    <View style={styles.tools}>
      {paged.searchable ? (
        <SearchBox testID={`${testID}-search`} value={paged.query} onChange={paged.setQuery} placeholder={hint} />
      ) : null}
      {paged.long ? (
        <SortControl testID={`${testID}-sort`} choices={paged.choices} value={paged.sort} onChange={paged.setSort} />
      ) : null}
    </View>
  );
}

/** The line in place of a list when a search finds nothing. */
export function NoMatch({ text, testID }: { text: string; testID: string }) {
  const { palette } = useTheme();
  return (
    <Text testID={testID} style={[styles.noMatch, { color: palette.neutral[500] }]}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  tools: { gap: space.inner },
  search: {
    minHeight: space.rowMinHeight,
    borderRadius: radius.input,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inner,
    paddingHorizontal: space.rowX,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: typeScale.label.fontSize,
    paddingVertical: 0,
  },
  sortRow: { flexDirection: 'row' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.inner },
  pageOf: { flexShrink: 1, textAlign: 'center', fontFamily: fonts.regular, ...typeScale.small },
  noMatch: { fontFamily: fonts.regular, ...typeScale.body },
});
