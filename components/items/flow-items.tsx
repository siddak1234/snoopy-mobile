import { useFocusEffect } from 'expo-router';
import { CaretRight, Funnel, UploadSimple } from 'phosphor-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConnectionRow } from '@/components/connection-row';
import { Dropdown } from '@/components/dropdown';
import { ItemUploadDialog } from '@/components/items/item-upload-dialog';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ScopePill } from '@/components/scope-control';
import { Text } from '@/components/text';
import { em, fonts, iconSize, typeScale } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useTheme } from '@/hooks/use-theme';
import { FIGURE_UNAVAILABLE, noItemsYet, uploadItemLabel } from '@/lib/content/screen-states';
import { readItems, type AutomationItems, type Item } from '@/lib/platform/automations';
import { EMPTY } from '@/lib/view/format';
import { ALL_GROUPS, groupItems, itemGroupChoices, itemRowLine, itemsStillGoing, shownGroup } from '@/lib/view/items';
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
 * first~~ until build 28.
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
  const groups = groupItems(shown, declared, chosen);
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
        <SectionLabel style={styles.label}>{declared.words.plural.toUpperCase()}</SectionLabel>
        {canManage ? (
          <PillButton
            testID="flow-items-upload"
            label={uploadItemLabel(declared.words)}
            variant="secondary"
            height={36}
            fontSize={typeScale.body.fontSize}
            icon={UploadSimple}
            iconSize={iconSize.button}
            onPress={() => setUploadOpen(true)}
          />
        ) : null}
      </View>
      {choices.length > 0 ? (
        <View style={styles.filter}>
          <Dropdown
            testID="flow-items-filter"
            title={filterTitle}
            options={choices}
            value={chosen}
            open={filterOpen}
            onOpenChange={setFilterOpen}
            onChange={(next) => {
              setPicked(next);
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
        </View>
      ) : null}
      <SurfaceCard style={styles.card}>
        {empty !== null ? (
          <Text testID="flow-items-empty" style={[styles.empty, { color: palette.neutral[500] }]}>
            {empty}
          </Text>
        ) : null}
        {groups.map((group, g) => (
          <View
            key={group.name ?? `none-${g}`}
            testID={`flow-items-group-${g}`}
            style={g > 0 && { borderTopWidth: 1, borderTopColor: palette.divider }}>
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
      </SurfaceCard>
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
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 36 },
  label: { flex: 1 },
  card: { marginTop: 9 },
  filter: { flexDirection: 'row', marginTop: 9 },
  empty: { paddingVertical: 13, paddingHorizontal: 14, fontFamily: fonts.regular, ...typeScale.body },
  group: {
    paddingTop: 12,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: typeScale.caption.fontSize,
    letterSpacing: em(0.14, typeScale.caption.fontSize),
  },
});
