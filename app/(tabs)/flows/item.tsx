import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Archive, CaretRight } from 'phosphor-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StartRun, canStartRun } from '@/components/automations/start-run';
import { ConnectionRow } from '@/components/connection-row';
import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { BackCircle } from '@/components/nocturne/back-circle';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Pressable } from '@/components/pressable';
import { RunSections } from '@/components/runs/run-sections';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { Text } from '@/components/text';
import { em, fonts, iconSize, layout, status, typeScale, withAlpha } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { roleIn, useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import {
  ARCHIVE_LABEL,
  ARCHIVING_LABEL,
  ITEM_NOT_ARCHIVED,
  START_LABEL,
  WHAT_AI_READ_LABEL,
  addRunLabel,
  archiveItemBody,
  archiveItemLabel,
  archiveItemTitle,
  errorTitleFor,
  noRunsYet,
} from '@/lib/content/screen-states';
import { archiveItem, readItem } from '@/lib/platform/automations';
import { readCatalog } from '@/lib/platform/catalog';
import { PlatformNotConfiguredError } from '@/lib/platform/problem';
import { readRemovedSubscriptionsOrNone, readSubscriptions } from '@/lib/platform/runs';
import { itemStatusLine, itemsStillGoing, rankedRuns } from '@/lib/view/items';
import { administers } from '@/lib/view/roles';
import { RUN_REREAD_MS } from '@/lib/view/runs';

/**
 * One of a flow's items (backend ADR-0046; Round 19, plan §5.3) — the website's
 * `/account/flows/[subscriptionId]/items/[itemId]`, opened from a row on its
 * flow's page. Top to bottom: its title; its group's value and where it is
 * ("{group} · Ready", "Reading…", "Couldn't read: …"); for an owner or admin,
 * "Add {one of its runs}" — the flow's run fields and Start, the run naming
 * this item (`createRun`'s `itemId`), offered once it is read, while it is not
 * archived and its flow can run; its runs as the platform ranks them, numbered,
 * each its title (or "Reading…"), its score and its result line, a failed one
 * dimmed, each opening its run; "What AI read", the item's sections, each
 * closed; and, for an owner or admin, Archive, behind the confirmation the
 * flow's own archive asks. Every word for the flow's things is its manifest's
 * (`items.words`, `items.runWords`). Read again every `RUN_REREAD_MS` while the
 * item is read or a run goes on, and the page is in front.
 */
export default function ItemScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const session = useSession();
  const { item: itemId } = useLocalSearchParams<{ item?: string }>();
  const archiveKeys = useIntentKeys('item-archive');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [reads, setReads] = useState(0);

  /** The item and its ranked runs, and its flow as it is now — for its words, its run fields and whether it runs. */
  const page = useWorkspaceResource(
    async (workspaceId) => {
      try {
        if (!itemId) throw new PlatformNotConfiguredError();
        const [read, live, catalog] = await Promise.all([
          readItem(workspaceId, itemId),
          readSubscriptions(workspaceId),
          readCatalog(workspaceId),
        ]);
        const own = (rows: typeof live.subscriptions) => rows.find((row) => row.id === read.item.subscriptionId);
        const subscription =
          own(live.subscriptions) ?? own((await readRemovedSubscriptionsOrNone(workspaceId)).subscriptions);
        const entry = subscription ? catalog.automations.find((a) => a.templateId === subscription.templateId) : undefined;
        return { ...read, subscription, entry };
      } finally {
        setReads((n) => n + 1);
      }
    },
    [itemId],
  );

  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const going = page.status === 'ready' && itemsStillGoing([page.data.item], page.data.runs);
  const { refresh } = page;
  useEffect(() => {
    if (!going || !focused) return;
    const timer = setTimeout(refresh, RUN_REREAD_MS);
    return () => clearTimeout(timer);
  }, [going, focused, reads, refresh]);

  const archive = async () => {
    if (archiving || page.status !== 'ready') return;
    const workspaceId = workspaceIfShown(session, page.loadedFor);
    if (!workspaceId) {
      setArchiveError(WORKSPACE_CHANGED);
      return;
    }
    setArchiving(true);
    setArchiveError(null);
    try {
      await archiveItem(workspaceId, page.data.item.id, archiveKeys.keyFor());
      archiveKeys.settle();
      setArchiveOpen(false);
      router.back();
    } catch (caught) {
      setArchiveError(refusalMessage(caught, {}, ITEM_NOT_ARCHIVED));
    } finally {
      setArchiving(false);
    }
  };

  if (page.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (page.status === 'offline') {
    return <ScreenOffline onRetry={() => page.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (page.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('item')} onBack={() => router.back()} topInset={insets.top} />;
  }
  // Its flow's words are the page's: an item whose flow no longer declares them cannot be drawn honestly.
  const declared = page.status === 'ready' ? page.data.subscription?.items : undefined;
  if (page.status === 'error' || !declared) {
    return (
      <ScreenError
        title={errorTitleFor('item')}
        onRetry={() => page.reload()}
        body={busyBody(page)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  const { item, runs, subscription, entry } = page.data;
  const canManage = administers(roleIn(session, page.loadedFor));
  const archived = item.archivedAt !== null;
  const addable =
    canManage &&
    !archived &&
    item.status === 'ready' &&
    subscription !== undefined &&
    canStartRun(subscription, entry, subscription.status === 'live');
  const ranked = rankedRuns(runs);

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}>
      <View style={styles.headerRow}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text testID="item-title" selectable style={[styles.title, { color: palette.text }]}>
            {item.title}
          </Text>
          <Text
            testID="item-status"
            style={[styles.sub, { color: item.status === 'failed' ? status.err : palette.neutral[400] }]}>
            {itemStatusLine(item, declared.groupField)}
          </Text>
        </View>
      </View>

      {addable && subscription ? (
        <View testID="item-add-run">
          <SectionLabel>{addRunLabel(declared.runWords).toUpperCase()}</SectionLabel>
          <SurfaceCard style={styles.underLabel}>
            <StartRun
              key={`${subscription.id}:${item.id}`}
              subscriptionId={subscription.id}
              shownWorkspaceId={page.loadedFor}
              runInput={subscription.runInput ?? []}
              itemId={item.id}
              startLabel={START_LABEL}
              // The new run joins the list below, "Reading…", and is read with it.
              onStarted={() => refresh()}
            />
          </SurfaceCard>
        </View>
      ) : null}

      <View testID="item-runs">
        <SectionLabel>{declared.runWords.plural.toUpperCase()}</SectionLabel>
        <SurfaceCard style={styles.underLabel}>
          {ranked.length === 0 ? (
            <Text testID="item-runs-empty" style={[styles.empty, { color: palette.neutral[500] }]}>
              {noRunsYet(declared.runWords)}
            </Text>
          ) : null}
          {ranked.map((row, i) => (
            <View key={row.id} testID={`item-run-${row.id}-row`} style={row.dim && styles.dim}>
              <ConnectionRow
                testID={`item-run-${row.id}`}
                mark={<Text style={[styles.rank, { color: palette.neutral[400] }]}>{row.rank}</Text>}
                name={row.title}
                line={row.line}
                right={
                  <View style={styles.right}>
                    {row.score !== null ? (
                      <Text testID={`item-run-${row.id}-score`} style={[styles.score, { color: palette.text }]}>
                        {row.score}
                      </Text>
                    ) : null}
                    <CaretRight size={15} color={palette.neutral[500]} />
                  </View>
                }
                divider={i < ranked.length - 1}
                onPress={() =>
                  router.push({ pathname: '/(tabs)/activity/run', params: { runId: row.id, returnTo: 'flows' } }, { withAnchor: true })
                }
              />
            </View>
          ))}
        </SurfaceCard>
      </View>

      {item.sections ? (
        <View testID="item-read">
          <SectionLabel>{WHAT_AI_READ_LABEL}</SectionLabel>
          <View style={styles.underLabel}>
            <RunSections testID="item-sections" sections={item.sections} firstOpen={false} />
          </View>
        </View>
      ) : null}

      {/* Last, in red, where a person scrolls to it — as the flow's own Archive (24.9.4). */}
      {canManage && !archived ? (
        <Pressable
          testID="item-archive"
          accessibilityRole="button"
          accessibilityLabel={archiveItemTitle(item.title)}
          onPress={() => {
            setArchiveError(null);
            setArchiveOpen(true);
          }}
          style={({ pressed }) => [
            styles.archive,
            { borderColor: palette.danger },
            pressed && { backgroundColor: withAlpha(palette.danger, 0.08) },
          ]}>
          <Archive size={iconSize.button} color={palette.danger} />
          <Text style={[styles.archiveLabel, { color: palette.danger }]}>{archiveItemLabel(declared.words)}</Text>
        </Pressable>
      ) : null}

      <Dialog
        visible={archiveOpen}
        testID="item-archive-dialog"
        onRequestClose={archiving ? () => undefined : () => setArchiveOpen(false)}
        title={archiveItemTitle(item.title)}
        body={archiveItemBody(declared.runWords)}
        actions={
          <>
            <DialogButton label="Cancel" disabled={archiving} onPress={() => setArchiveOpen(false)} />
            <DialogButton
              testID="item-archive-confirm"
              tone="danger"
              disabled={archiving}
              onPress={archive}
              label={archiving ? ARCHIVING_LABEL : ARCHIVE_LABEL}
            />
          </>
        }>
        {archiveError ? <DialogText tone="error">{archiveError}</DialogText> : null}
      </Dialog>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: 20, gap: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: fonts.medium,
    fontSize: typeScale.heading.fontSize,
    letterSpacing: em(-0.01, typeScale.heading.fontSize),
  },
  sub: { marginTop: 1, fontFamily: fonts.regular, fontSize: typeScale.body.fontSize },
  underLabel: { marginTop: 9 },
  empty: { paddingVertical: 13, paddingHorizontal: 14, fontFamily: fonts.regular, ...typeScale.body },
  dim: { opacity: 0.55 },
  rank: { minWidth: 20, fontFamily: fonts.medium, fontSize: typeScale.label.fontSize },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  score: { fontFamily: fonts.medium, fontSize: typeScale.title.fontSize },
  archive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
    paddingVertical: 13,
    paddingHorizontal: layout.rowPadH,
    borderWidth: 1,
    borderRadius: 14,
  },
  archiveLabel: { fontFamily: fonts.medium, fontSize: typeScale.label.fontSize },
});
