import { CaretDown, CaretRight, ListBullets } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { StartRun, canStartRun } from '@/components/automations/start-run';
import { ConnectionRow, GlyphMark } from '@/components/connection-row';
import { Dropdown } from '@/components/dropdown';
import { DividedCard } from '@/components/group';
import { ScopePill } from '@/components/scope-control';
import { Text } from '@/components/text';
import { em, fonts, iconSize, space, typeScale } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useTheme } from '@/hooks/use-theme';
import { CHOOSE_LABEL, FIGURE_UNAVAILABLE, noItemsYet } from '@/lib/content/screen-states';
import { readItems, type AutomationItems } from '@/lib/platform/automations';
import type { Subscription } from '@/lib/platform/runs';
import { EMPTY } from '@/lib/view/format';
import { homeFlowName, type HomeFlow } from '@/lib/view/home';
import { iconFor } from '@/lib/view/icon-registry';
import { groupItems } from '@/lib/view/items';

/**
 * YOUR FLOWS on Home (the owner's build 34 F5: "The goal of this section is
 * quick and easy access to start a run"): one card, a section per department —
 * its name over its flows (`yourFlows`) — each flow a row, its icon and name;
 * drawn only while a flow is live in the scope chosen, as the website's.
 * Tapped, a flow that can start a run here (`canStartRun`) opens under its row
 * to its run's first step — the fields of its `runInput`, from the
 * subscriptions list Home already read, and Start run (`StartRun`: the upload
 * and start-run path the flow page uses) — and tapped again, closes; each opens
 * and closes on its own, as the website's. Start run starts the run and opens
 * its page (`onStarted`). A flow
 * with items (backend ADR-0046) asks first for which one — its ready items, read
 * only once its row is open (`readItems`), by its group field's value A–Z in a
 * drop-down — and, as on an item's page, only to an owner or admin. A flow that
 * cannot start a run here opens its flow page (`onOpen`).
 *
 * testIDs: a section `home-flows-section-${n}`, a row `home-flow-${id}`, its
 * form `home-flow-${id}-form`, the item choice `home-flow-${id}-item`.
 */
export function YourFlows({
  sections,
  shownWorkspaceId,
  canManage,
  onStarted,
  onOpen,
}: {
  sections: { department: string | null; flows: HomeFlow[] }[];
  /** The workspace Home loaded; a run is refused once it is not active. */
  shownWorkspaceId: string | null;
  /** An owner or admin: a flow with items starts here too. */
  canManage: boolean;
  onStarted: (runId: string) => void;
  onOpen: (subscriptionId: string) => void;
}) {
  const { palette } = useTheme();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <DividedCard testID="home-flows">
      {sections.map((section, at) => (
        <View key={section.department ?? 'unnamed'} testID={`home-flows-section-${at}`}>
          {section.department ? (
            <Text accessibilityRole="header" style={[styles.department, { color: palette.neutral[400] }]}>
              {section.department.toUpperCase()}
            </Text>
          ) : null}
          {section.flows.map((flow, row) => {
            const { subscription, entry } = flow;
            const id = subscription.id;
            const startable = canStartRun(subscription, entry, true) && (!subscription.items || canManage);
            const expanded = open.has(id);
            return (
              <View key={id}>
                <ConnectionRow
                  testID={`home-flow-${id}`}
                  mark={<GlyphMark icon={iconFor(entry?.icon)} />}
                  name={homeFlowName(flow)}
                  accessibilityState={startable ? { expanded } : undefined}
                  right={
                    startable ? (
                      <CaretDown
                        size={iconSize.button}
                        color={palette.neutral[400]}
                        style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
                      />
                    ) : (
                      <CaretRight size={15} color={palette.neutral[500]} />
                    )
                  }
                  divider={row < section.flows.length - 1 && !expanded}
                  onPress={() => (startable ? toggle(id) : onOpen(id))}
                />
                {expanded ? (
                  <View
                    testID={`home-flow-${id}-form`}
                    style={row < section.flows.length - 1 ? [styles.form, { borderBottomColor: palette.divider }] : undefined}>
                    {subscription.items ? (
                      <ItemStart
                        subscription={subscription}
                        items={subscription.items}
                        shownWorkspaceId={shownWorkspaceId}
                        onStarted={onStarted}
                      />
                    ) : (
                      <StartRun
                        key={`${id}:${subscription.templateVersion}`}
                        subscriptionId={id}
                        shownWorkspaceId={shownWorkspaceId}
                        runInput={subscription.runInput ?? []}
                        onStarted={onStarted}
                      />
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </DividedCard>
  );
}

/**
 * A flow with items, open on Home: which one the run is for — its ready items,
 * read now and only now, in the drop-down by its group field's value A–Z, each
 * value's items A–Z (`groupItems`, as its flow page lists them) — then, one
 * chosen, its run's fields and Start run, the run naming it. Read, failed or
 * empty in the words its flow page uses.
 */
function ItemStart({
  subscription,
  items: declared,
  shownWorkspaceId,
  onStarted,
}: {
  subscription: Subscription;
  items: AutomationItems;
  shownWorkspaceId: string | null;
  onStarted: (runId: string) => void;
}) {
  const { palette } = useTheme();
  const [chosen, setChosen] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const listed = useWorkspaceResource((workspaceId) => readItems(workspaceId, subscription.id), [subscription.id]);
  const ready =
    listed.status === 'ready' ? listed.data.items.filter((item) => item.status === 'ready' && item.archivedAt === null) : [];
  const options = groupItems(ready, declared).flatMap((group) =>
    group.items.map((item) => ({ value: item.id, label: item.title, ...(group.name ? { group: group.name } : {}) })),
  );
  const title = declared.words.singular;
  const label = options.find((option) => option.value === chosen)?.label ?? CHOOSE_LABEL;
  const line =
    listed.status === 'loading' ? EMPTY : listed.status !== 'ready' ? FIGURE_UNAVAILABLE : options.length === 0 ? noItemsYet(declared.words) : null;
  return (
    <View>
      {line !== null ? (
        <Text testID={`home-flow-${subscription.id}-items-line`} style={[styles.line, { color: palette.neutral[500] }]}>
          {line}
        </Text>
      ) : (
        <View style={styles.choice}>
          <Dropdown
            testID={`home-flow-${subscription.id}-item`}
            title={title}
            options={options}
            value={chosen}
            open={choosing}
            onOpenChange={setChoosing}
            onChange={(next) => {
              setChosen(next);
              setChoosing(false);
            }}
            trigger={
              <ScopePill
                testID={`home-flow-${subscription.id}-item`}
                icon={ListBullets}
                label={label}
                accessibilityLabel={`${title}: ${label}`}
                onPress={() => setChoosing(true)}
              />
            }
          />
        </View>
      )}
      {chosen ? (
        <StartRun
          key={`${subscription.id}:${chosen}`}
          subscriptionId={subscription.id}
          shownWorkspaceId={shownWorkspaceId}
          runInput={subscription.runInput ?? []}
          itemId={chosen}
          onStarted={onStarted}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // A department's name over its flows, as a flow page's item groups head theirs.
  department: {
    paddingTop: space.rowY,
    paddingHorizontal: space.rowX,
    fontFamily: fonts.regular,
    fontSize: typeScale.caption.fontSize,
    letterSpacing: em(0.14, typeScale.caption.fontSize),
  },
  // An open flow's form, a divider under it before the next flow.
  form: { borderBottomWidth: 1 },
  choice: { flexDirection: 'row', paddingHorizontal: space.rowX, paddingTop: space.inner },
  line: { paddingVertical: space.rowY, paddingHorizontal: space.rowX, fontFamily: fonts.regular, ...typeScale.body },
});
