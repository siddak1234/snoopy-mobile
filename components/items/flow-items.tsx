import { useFocusEffect } from 'expo-router';
import { CaretRight, Funnel, UploadSimple } from 'phosphor-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NoMatch, Pager, SearchBox, SortControl } from '@/components/blocks/paged';
import { ConnectionRow } from '@/components/connection-row';
import { Dropdown } from '@/components/dropdown';
import { DividedCard } from '@/components/group';
import { ItemUploadDialog } from '@/components/items/item-upload-dialog';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionTitle } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ScopePill } from '@/components/scope-control';
import { Text } from '@/components/text';
import { em, fonts, iconSize, space, typeScale } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useTheme } from '@/hooks/use-theme';
import { FIGURE_UNAVAILABLE, noItemsYet, uploadItemLabel } from '@/lib/content/screen-states';
import { readItems, type AutomationItems, type Item } from '@/lib/platform/automations';
import { EMPTY } from '@/lib/view/format';
import { BLOCK_WORDS } from '@/lib/generated/platform-contracts/block-rules';
import { fill } from '@/lib/view/block-sort';
import {
  ALL_GROUPS,
  ITEM_ORDERS,
  groupItems,
  itemGroupChoices,
  itemRowLine,
  itemsAreLong,
  itemsStillGoing,
  pageOfGroups,
  searchItems,
  searchItemsHint,
  shownGroup,
  type ItemOrder,
} from '@/lib/view/items';
import { RUN_REREAD_MS } from '@/lib/view/runs';

/**
 * A flow's items on its page (backend ADR-0046; Round 19, plan §3, as the
 * website draws them), in place of its dashboard, its steps and the run's start
 * form — a run of such a flow names an item, so it starts on the item's page:
 * the flow's word for many over the list ("{MANY}"), "Upload {one}" beside it
 * for an owner or admin; under them, for a flow that groups its items, the
 * filter — a drop-down (`Dropdown`, as Activity's outcome and the catalog's
 * category): "All {values}" first, then each value the items hold, A–Z (the
 * owner's build 28 item F2) — then the items: all of them by `groupField`'s
 * value, the values A–Z, each under its name, or the chosen value's alone;
 * each group's items A–Z by title (`groupItems`), each row its title and "{n}
 * {runs} · Top {score}", "Reading…" or "Couldn't read", opening the item's
 * page. None yet: "No {many} yet.". Read again every `RUN_REREAD_MS` while one
 * is being read and the page is in front, one read at a time, as the run page
 * reads a run that goes on. A read that fails costs this list its rows
 * ("Unavailable"), never the page. ~~Grouped in the options' order, rows newest
 * first~~ until build 28. Round 21 (backend ADR-0048 amendment 1, point 4):
 * the search box always (`BLOCK_WORDS.searchItems`, by title; a miss says
 * `noMatch`), and over 25 items the sort — `aToZ`, `newestFirst` — and the
 * pages of 25 under the card; a new search or sort goes back to page
 * 1. The groups are one card with a divider between each (`DividedCard`; ~~a
 * hand-drawn border~~), the title `title` above it (`SectionTitle`).
 */
export function FlowItems({
  subscriptionId,
  items: declared,
  shownWorkspaceId,
  canManage,
  onOpen,
}: {
  subscriptionId: string;
  items: AutomationItems;
  /** The workspace the page loaded; an upload is refused once it is not active. */
  shownWorkspaceId: string | null;
  canManage: boolean;
  onOpen: (itemId: string) => void;
}) {
  const { palette } = useTheme();
  const [reads, setReads] = useState(0);
  const listed = useWorkspaceResource(
    (workspaceId) => readItems(workspaceId, subscriptionId).finally(() => setReads((n) => n + 1)),
    [subscriptionId],
  );
  // An item just made shows at once, "Reading…", until a read lists it — and
  // from then on only as the reads list it: archived later, it is gone.
  const [made, setMade] = useState<Item[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [picked, setPicked] = useState(ALL_GROUPS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<ItemOrder>('title');
  const [page, setPage] = useState(1);
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const read = listed.status === 'ready' ? listed.data : null;
  useEffect(() => {
    if (!read) return;
    setMade((was) => {
      const left = was.filter((item) => !read.items.some((row) => row.id === item.id));
      return left.length === was.length ? was : left;
    });
  }, [read]);
  const shown = read ? [...made.filter((item) => !read.items.some((row) => row.id === item.id)), ...read.items] : made;
  const going = itemsStillGoing(shown);
  const { refresh } = listed;
  useEffect(() => {
    if (!going || !focused) return;
    const timer = setTimeout(refresh, RUN_REREAD_MS);
    return () => clearTimeout(timer);
  }, [going, focused, reads, refresh]);

  const choices = itemGroupChoices(shown, declared);
  // A value the list no longer holds (its last item archived) reads as all of them.
  const chosen = shownGroup(choices, picked);
  const chosenLabel = choices.find((choice) => choice.value === chosen)?.label ?? '';
  const filterTitle = declared.fields.find((field) => field.key === declared.groupField)?.title ?? '';
  const found = searchItems(shown, query);
  const long = itemsAreLong(shown.length);
  const paged = pageOfGroups(groupItems(found, declared, chosen, long ? order : 'title'), page);
  const groups = paged.groups;
  const noMatch = shown.length > 0 && found.length === 0 ? fill(BLOCK_WORDS.noMatch, { query: query.trim() }) : null;
  const empty =
    listed.status === 'loading' && shown.length === 0
      ? EMPTY
      : listed.status !== 'ready' && shown.length === 0
        ? FIGURE_UNAVAILABLE
        : shown.length === 0
          ? noItemsYet(declared.words)
          : null;

  return (
    <View testID="flow-items">
      <View style={styles.head}>
        <View style={styles.label}>
          <SectionTitle flush>{declared.words.plural.toUpperCase()}</SectionTitle>
        </View>
        {canManage ? (
          <PillButton
            testID="flow-items-upload"
            label={uploadItemLabel(declared.words)}
            variant="secondary"
            fontSize={typeScale.body.fontSize}
            icon={UploadSimple}
            iconSize={iconSize.button}
            onPress={() => setUploadOpen(true)}
          />
        ) : null}
      </View>
      <View style={styles.body}>
        <SearchBox
          testID="flow-items-search"
          value={query}
          onChange={(next) => {
            setQuery(next);
            setPage(1);
          }}
          placeholder={searchItemsHint(declared.words)}
        />
        {choices.length > 0 || long ? (
          <View style={styles.tools}>
            {choices.length > 0 ? (
              <Dropdown
                testID="flow-items-filter"
                title={filterTitle}
                options={choices}
                value={chosen}
                open={filterOpen}
                onOpenChange={setFilterOpen}
                onChange={(next) => {
                  setPicked(next);
                  setPage(1);
                  setFilterOpen(false);
                }}
                trigger={
                  <ScopePill
                    testID="flow-items-filter"
                    icon={Funnel}
                    label={chosenLabel}
                    accessibilityLabel={`${filterTitle}: ${chosenLabel}`}
                    onPress={() => setFilterOpen(true)}
                  />
                }
              />
            ) : null}
            {long ? (
              <SortControl
                testID="flow-items-sort"
                choices={ITEM_ORDERS}
                value={order}
                onChange={(next) => {
                  setOrder(next as ItemOrder);
                  setPage(1);
                }}
              />
            ) : null}
          </View>
        ) : null}
        {noMatch !== null ? (
          <NoMatch testID="flow-items-no-match" text={noMatch} />
        ) : empty !== null ? (
          <SurfaceCard>
            <Text testID="flow-items-empty" style={[styles.empty, { color: palette.neutral[500] }]}>
              {empty}
            </Text>
          </SurfaceCard>
        ) : (
          <DividedCard testID="flow-items-card">
            {groups.map((group, g) => (
              <View key={group.name ?? `none-${g}`} testID={`flow-items-group-${g}`}>
                {/* Each value's name over its items while all are shown; the filter says the one chosen. */}
                {group.name && chosen === ALL_GROUPS ? (
                  <Text style={[styles.group, { color: palette.neutral[400] }]}>{group.name.toUpperCase()}</Text>
                ) : null}
                {group.items.map((item, i) => (
                  <ConnectionRow
                    key={item.id}
                    testID={`flow-item-${item.id}`}
                    mark={null}
                    name={item.title}
                    line={itemRowLine(item, declared.runWords)}
                    lineTone={item.status === 'failed' ? 'err' : 'muted'}
                    right={<CaretRight size={15} color={palette.neutral[500]} />}
                    divider={i < group.items.length - 1}
                    onPress={() => onOpen(item.id)}
                  />
                ))}
              </View>
            ))}
          </DividedCard>
        )}
        {long && noMatch === null ? (
          <Pager testID="flow-items-pager" page={paged.page} pages={paged.pages} onPage={setPage} />
        ) : null}
      </View>
      {uploadOpen ? (
        <ItemUploadDialog
          items={declared}
          choices={read?.choices ?? {}}
          subscriptionId={subscriptionId}
          shownWorkspaceId={shownWorkspaceId}
          onClose={() => setUploadOpen(false)}
          onMade={(item) => {
            setUploadOpen(false);
            setMade((was) => [item, ...was.filter((row) => row.id !== item.id)]);
            refresh();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The title and the upload button on one line, `title` above what they head.
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.inner, marginBottom: space.title },
  label: { flex: 1 },
  body: { gap: space.inner },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: space.inner },
  empty: { paddingVertical: space.rowY, paddingHorizontal: space.rowX, fontFamily: fonts.regular, ...typeScale.body },
  group: {
    paddingTop: space.rowY,
    paddingHorizontal: space.rowX,
    fontFamily: fonts.regular,
    fontSize: typeScale.caption.fontSize,
    letterSpacing: em(0.14, typeScale.caption.fontSize),
  },
});
