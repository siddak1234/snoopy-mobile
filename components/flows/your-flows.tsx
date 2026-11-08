import { useFocusEffect } from 'expo-router';
import { ArrowRight, ListBullets, Stack, UploadSimple, type Icon } from 'phosphor-react-native';
import React, { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { NoMatch, SearchBox } from '@/components/blocks/paged';
import { StartRun, canStartRun } from '@/components/automations/start-run';
import { Dropdown } from '@/components/dropdown';
import { FlowCard } from '@/components/flows/flow-card';
import { ItemUploadDialog } from '@/components/items/item-upload-dialog';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionTitle } from '@/components/nocturne/section-label';
import { ScopePill } from '@/components/scope-control';
import { Text } from '@/components/text';
import { fonts, iconSize, space, typeScale } from '@/constants/theme';
import { useAccessibilityTextSize } from '@/hooks/use-accessibility-text-size';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useTheme } from '@/hooks/use-theme';
import {
  FIGURE_UNAVAILABLE,
  ITEM_READING,
  NO_MATCHES,
  noItemsYet,
  uploadItemLabel,
} from '@/lib/content/screen-states';
import { readItems, type AutomationItems, type Item } from '@/lib/platform/automations';
import type { Subscription } from '@/lib/platform/runs';
import { EMPTY } from '@/lib/view/format';
import {
  ALL_DEPARTMENTS,
  homeDepartmentChoices,
  homeFlowName,
  homeFlowsShown,
  newestReadyItem,
  type HomeFlow,
} from '@/lib/view/home';
import { iconFor } from '@/lib/view/icon-registry';
import { groupItems, itemsStillGoing } from '@/lib/view/items';
import { RUN_REREAD_MS } from '@/lib/view/runs';

/** The words Home's flow card offers for a flow it cannot start here: its page. */
export const OPEN_FLOW_LABEL = 'Open';

/** A run started on Home: what Home opens (`onStarted`) — the run, its flow, and the job it is for. */
export type HomeStarted = { runId: string; subscriptionId: string; itemId?: string };

/**
 * YOUR FLOWS on Home (the owner's build 34 F5: "quick and easy access to start
 * a run"; build 39 item 8: "Rather than drop downs lets make them Individual
 * cards … Your flows —- on the right hand side department select drop down /
 * Search bar / Department name in sorted order / Quick access cards"): the
 * title with the department drop-down on its right — "All departments", then
 * each department A–Z (`homeDepartmentChoices`; the catalog `category` Home
 * groups by) — then the search box ("Search flows", by name, any case;
 * nothing found says `NO_MATCHES`), then each department's name over its
 * cards. ~~One card of rows, each opening under its caret~~ until builds 37 and
 * 39: every flow is its own card (`FlowCard`, `compact`: icon and name, then
 * the start controls; ~~description and pill~~ until build 41, the owner's
 * item 14: "Just the logo, title, then the buttons and items"), always open,
 * its start form inside it. Two rows since the owner's build 42 item 16 ("It
 * looks like big squares for a quick access"): the icon and name, a flow with
 * jobs' job pill on their right; then the buttons — for a run input of one
 * file, Take photo, Upload and Start on one wrapping row, no Paperclip and no
 * field title (`StartRun` `compact`); ~~the field's title row, its buttons,
 * then Start run at full width, the job drop-down on a row of its own~~ until
 * build 42:
 *
 * - a flow that can start a run here (`canStartRun`): its run's fields and
 *   Start (`StartRun` `compact`; the flow page's draws it in full);
 * - a flow with items (backend ADR-0046), to an owner or admin: the job
 *   drop-down in the title row, chosen at once for the newest ready job
 *   (`newestReadyItem`; the owner's build 37 item 5) and still changeable, then
 *   the run's fields; with no ready job, "No {jobs} yet." and "Upload {job}"
 *   (build 37 item 2) on one wrapping row, Upload opening the flow page's upload
 *   card (`ItemUploadDialog`) — the job then reads in the card ("Reading…") and,
 *   ready, is chosen, without leaving Home;
 * - any other (a member on a flow with items, a flow that cannot start here):
 *   "Open", to its flow page (`onOpen`).
 *
 * A flow with items has its items read when Home draws it — one read per such
 * flow, each settling alone, "Unavailable" in its place when refused — and
 * again every `RUN_REREAD_MS` while one is being read and Home is in front
 * (as the flow page's list, `FlowItems`). ~~Read once its row was opened~~ and
 * ~~the "Choose" pill cut off by the card's edge~~ (build 37 item 3) until
 * builds 37 and 39.
 *
 * testIDs: the department drop-down `home-flows-department`, the search
 * `home-flows-search`, nothing found `home-flows-no-match`, a section
 * `home-flows-section-${n}`, a card `home-flow-${id}` (`FlowCard`'s), its form
 * `home-flow-${id}-form`, its title row `home-flow-${id}-top`, the job choice
 * `home-flow-${id}-item`, its line `home-flow-${id}-items-line`, the no-job row
 * `home-flow-${id}-empty-row`, Upload `home-flow-${id}-upload`, a job reading
 * `home-flow-${id}-reading`, Open `home-flow-${id}-open`.
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
  onStarted: (started: HomeStarted) => void;
  onOpen: (subscriptionId: string) => void;
}) {
  const [department, setDepartment] = useState(ALL_DEPARTMENTS);
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState('');
  const choices = homeDepartmentChoices(sections);
  // A department no longer drawn (its last flow gone) reads as all of them.
  const chosen = choices.some((choice) => choice.value === department) ? department : ALL_DEPARTMENTS;
  const chosenLabel = choices.find((choice) => choice.value === chosen)!.label;
  const shown = homeFlowsShown(sections, chosen, query);
  return (
    <View testID="home-flows">
      <View style={styles.head}>
        <View style={styles.title}>
          <SectionTitle flush>YOUR FLOWS</SectionTitle>
        </View>
        <Dropdown
          testID="home-flows-department"
          options={choices}
          value={chosen}
          open={choosing}
          onOpenChange={setChoosing}
          align="end"
          onChange={(next) => {
            setDepartment(next);
            setChoosing(false);
          }}
          trigger={
            <ScopePill
              testID="home-flows-department"
              icon={Stack}
              label={chosenLabel}
              accessibilityLabel={`YOUR FLOWS: ${chosenLabel}`}
              onPress={() => setChoosing(true)}
            />
          }
        />
      </View>
      <View style={styles.body}>
        <SearchBox testID="home-flows-search" value={query} onChange={setQuery} placeholder="Search flows" />
        {shown.length === 0 ? <NoMatch testID="home-flows-no-match" text={NO_MATCHES} /> : null}
        {shown.map((section, at) => (
          <View key={section.department ?? 'unnamed'} testID={`home-flows-section-${at}`} style={styles.section}>
            {section.department ? <SectionTitle flush>{section.department.toUpperCase()}</SectionTitle> : null}
            {section.flows.map((flow) => (
              <HomeFlowCard
                key={flow.subscription.id}
                flow={flow}
                shownWorkspaceId={shownWorkspaceId}
                canManage={canManage}
                onStarted={onStarted}
                onOpen={onOpen}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/** One flow's card on Home: the flow card, its form inside it, or Open. */
function HomeFlowCard({
  flow,
  shownWorkspaceId,
  canManage,
  onStarted,
  onOpen,
}: {
  flow: HomeFlow;
  shownWorkspaceId: string | null;
  canManage: boolean;
  onStarted: (started: HomeStarted) => void;
  onOpen: (subscriptionId: string) => void;
}) {
  const { subscription, entry } = flow;
  const id = subscription.id;
  const startable = canStartRun(subscription, entry, true) && (!subscription.items || canManage);
  const icon = iconFor(entry?.icon);
  const name = homeFlowName(flow);
  // A flow with jobs draws its own card: its job pill sits in the title row.
  if (startable && subscription.items) {
    return (
      <ItemStart
        subscription={subscription}
        items={subscription.items}
        icon={icon}
        name={name}
        shownWorkspaceId={shownWorkspaceId}
        onStarted={onStarted}
      />
    );
  }
  return (
    <FlowCard testID={`home-flow-${id}`} icon={icon} name={name} compact>
      {startable ? (
        <View testID={`home-flow-${id}-form`}>
          <StartRun
            key={`${id}:${subscription.templateVersion}`}
            subscriptionId={id}
            shownWorkspaceId={shownWorkspaceId}
            runInput={subscription.runInput ?? []}
            compact
            onStarted={(runId) => onStarted({ runId, subscriptionId: id })}
          />
        </View>
      ) : (
        <PillButton
          testID={`home-flow-${id}-open`}
          label={OPEN_FLOW_LABEL}
          variant="secondary"
          fontSize={typeScale.body.fontSize}
          icon={ArrowRight}
          iconSize={iconSize.button}
          accessibilityLabel={`${OPEN_FLOW_LABEL} ${name}`}
          onPress={() => onOpen(id)}
        />
      )}
    </FlowCard>
  );
}

/**
 * A flow with items on Home, its whole card (`FlowCard` `compact`): which job
 * the run is for — its ready items in the drop-down by its group field's value
 * A–Z (`groupItems`, as its flow page), the newest ready one chosen until the
 * person chooses (`newestReadyItem`), the pill on the right of the title row
 * (under the name at the accessibility sizes, `stacked`) — then its run's
 * fields and Start (`StartRun` `compact`), the run naming it. None ready: "No
 * {jobs} yet." and "Upload {job}" on one wrapping row; one being read,
 * "{title}" and "Reading…"; the list loading or refused, its line, in the card.
 */
function ItemStart({
  subscription,
  items: declared,
  icon,
  name,
  shownWorkspaceId,
  onStarted,
}: {
  subscription: Subscription;
  items: AutomationItems;
  icon: Icon;
  name: string;
  shownWorkspaceId: string | null;
  onStarted: (started: HomeStarted) => void;
}) {
  const { palette } = useTheme();
  const large = useAccessibilityTextSize();
  const [reads, setReads] = useState(0);
  const listed = useWorkspaceResource(
    (workspaceId) => readItems(workspaceId, subscription.id).finally(() => setReads((n) => n + 1)),
    [subscription.id],
  );
  // The person's own choice, kept across re-reads while the list still holds it ready.
  const [picked, setPicked] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  // A job just uploaded shows at once, "Reading…", until a read lists it; from then on, as read.
  const [made, setMade] = useState<Item[]>([]);
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const read = listed.status === 'ready' ? listed.data : null;
  const all = read ? [...made.filter((item) => !read.items.some((row) => row.id === item.id)), ...read.items] : made;
  const going = itemsStillGoing(all);
  const { refresh } = listed;
  useEffect(() => {
    if (!going || !focused) return;
    const timer = setTimeout(refresh, RUN_REREAD_MS);
    return () => clearTimeout(timer);
  }, [going, focused, reads, refresh]);

  const ready = all.filter((item) => item.status === 'ready' && item.archivedAt === null);
  const options = groupItems(ready, declared).flatMap((group) =>
    group.items.map((item) => ({ value: item.id, label: item.title, ...(group.name ? { group: group.name } : {}) })),
  );
  const chosen = ready.some((item) => item.id === picked) ? picked : (newestReadyItem(all)?.id ?? null);
  const title = declared.words.singular;
  const label = options.find((option) => option.value === chosen)?.label ?? '';
  const reading = all.find((item) => item.status === 'reading');
  const testID = `home-flow-${subscription.id}`;
  const lineStyle = [styles.line, { color: palette.neutral[500] }];

  /** The card: icon and name, `right` beside them (the job pill), then `body` — the form. */
  const card = (body: ReactNode, right?: ReactNode) => (
    <FlowCard testID={testID} icon={icon} name={name} compact right={right} stacked={large && right !== undefined}>
      <View testID={`${testID}-form`}>{body}</View>
    </FlowCard>
  );

  if (listed.status === 'loading' && all.length === 0) {
    return card(
      <Text testID={`${testID}-items-line`} style={lineStyle}>
        {EMPTY}
      </Text>,
    );
  }
  if (listed.status !== 'ready' && listed.status !== 'loading' && all.length === 0) {
    return card(
      <Text testID={`${testID}-items-line`} style={lineStyle}>
        {FIGURE_UNAVAILABLE}
      </Text>,
    );
  }
  const pill =
    chosen === null ? undefined : (
      <View style={large ? undefined : styles.aside}>
        <Dropdown
          testID={`${testID}-item`}
          title={title}
          options={options}
          value={chosen}
          open={choosing}
          onOpenChange={setChoosing}
          align="end"
          onChange={(next) => {
            setPicked(next);
            setChoosing(false);
          }}
          trigger={
            <ScopePill
              testID={`${testID}-item`}
              icon={ListBullets}
              label={label}
              accessibilityLabel={`${title}: ${label}`}
              onPress={() => setChoosing(true)}
            />
          }
        />
      </View>
    );
  return card(
    <>
      {chosen === null ? (
        reading ? (
          <View testID={`${testID}-reading`}>
            <Text style={[styles.reading, { color: palette.text }]}>{reading.title}</Text>
            <Text testID={`${testID}-items-line`} style={lineStyle}>
              {ITEM_READING}
            </Text>
          </View>
        ) : (
          <View testID={`${testID}-empty-row`} style={styles.emptyRow}>
            <Text testID={`${testID}-items-line`} style={lineStyle}>
              {noItemsYet(declared.words)}
            </Text>
            <PillButton
              testID={`${testID}-upload`}
              label={uploadItemLabel(declared.words)}
              variant="secondary"
              fontSize={typeScale.body.fontSize}
              icon={UploadSimple}
              iconSize={iconSize.button}
              onPress={() => setUploadOpen(true)}
            />
          </View>
        )
      ) : (
        <StartRun
          key={`${subscription.id}:${chosen}`}
          subscriptionId={subscription.id}
          shownWorkspaceId={shownWorkspaceId}
          runInput={subscription.runInput ?? []}
          itemId={chosen}
          compact
          onStarted={(runId) => onStarted({ runId, subscriptionId: subscription.id, itemId: chosen })}
        />
      )}
      {uploadOpen ? (
        <ItemUploadDialog
          items={declared}
          choices={read?.choices ?? {}}
          subscriptionId={subscription.id}
          shownWorkspaceId={shownWorkspaceId}
          onClose={() => setUploadOpen(false)}
          onMade={(item) => {
            setUploadOpen(false);
            setMade((was) => [item, ...was.filter((row) => row.id !== item.id)]);
            refresh();
          }}
        />
      ) : null}
    </>,
    pill,
  );
}

const styles = StyleSheet.create({
  // The title and the department drop-down on one line, `title` above what they head.
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.inner, marginBottom: space.title },
  title: { flex: 1 },
  body: { gap: space.group },
  section: { gap: space.inner },
  // The job pill beside the name: at most half the title row, so the name keeps room (build 42 item 16).
  aside: { flexShrink: 1, maxWidth: '50%' },
  // "No {jobs} yet." and Upload {job} on one row, wrapping when the words are large.
  emptyRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.inner },
  reading: { fontFamily: fonts.medium, ...typeScale.body },
  line: { fontFamily: fonts.regular, ...typeScale.body },
});
