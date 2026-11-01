import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Archive } from 'phosphor-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StartRun, canStartRun } from '@/components/automations/start-run';
import { BlockList } from '@/components/blocks/block-list';
import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { PillButton } from '@/components/nocturne/pill-button';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Page } from '@/components/page';
import { PageHeader } from '@/components/page-header';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { Text } from '@/components/text';
import { fonts, iconSize, status, typeScale } from '@/constants/theme';
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
  archiveItemBody,
  archiveItemLabel,
  archiveItemTitle,
  errorTitleFor,
} from '@/lib/content/screen-states';
import { archiveItem, readItem } from '@/lib/platform/automations';
import { readCatalog } from '@/lib/platform/catalog';
import { PlatformNotConfiguredError } from '@/lib/platform/problem';
import { readRemovedSubscriptionsOrNone, readSubscriptions } from '@/lib/platform/runs';
import { itemStatusLine, itemsStillGoing } from '@/lib/view/items';
import { administers } from '@/lib/view/roles';
import { RUN_REREAD_MS } from '@/lib/view/runs';

/**
 * One of a flow's items (backend ADR-0046; Round 19, plan §5.3) — the website's
 * `/account/flows/[subscriptionId]/items/[itemId]`, opened from a row on its
 * flow's page. Its header: its title; its group's value and where it is
 * ("{group} · Ready", "Reading…", "Couldn't read: …"). Then its page body as
 * the platform sent it (backend ADR-0048; `readItem`'s `shape=blocks`,
 * `BlockList`), in its flow's `pages.item` order: its tiles — Total and its
 * verdict words, green and red; the "{File title}" row, which opens the file it
 * was made from and its reading (`/(tabs)/flows/item-file`); "Add {one of its
 * runs}" and the run form — the flow's run fields and Start (`StartRun`), the
 * run naming this item — for an owner or admin, while it is not archived and
 * its flow can run (`canStartRun`); its runs as the platform ranks them, each a
 * row — its rank, its title (or "Reading…"), its score, read "Score" first by a
 * screen reader, and the arrow (`OpenRow`) — a failed one in the muted tone,
 * each opening its run. Its footer, for an owner or admin: Archive, behind the
 * confirmation the flow's own archive asks. Read again every `RUN_REREAD_MS`
 * while the platform says it or a run of it goes on (`going`), and the page is
 * in front. ~~Its tiles, Add and ranked runs drawn here from the item and its
 * runs (`itemTiles`, `rankedRuns`)~~ until Round 21.
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

  /** The item and its page body, and its flow as it is now — for its words, its run fields and whether it runs. */
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
  // The platform says whether it, or a run of it, still goes (`going`); a platform that sent no word, the item's own.
  const going =
    page.status === 'ready' && (page.data.going ?? itemsStillGoing([page.data.item], page.data.runs));
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
  const { item, blocks, subscription, entry } = page.data;
  const canManage = administers(roleIn(session, page.loadedFor));
  const archived = item.archivedAt !== null;
  const addable =
    canManage &&
    !archived &&
    item.status === 'ready' &&
    subscription !== undefined &&
    canStartRun(subscription, entry, subscription.status === 'live');
  // The run form (`questions{run}`): the flow's run fields and Start, under today's gates.
  const runForm = (form: { itemId?: string }) =>
    addable && subscription ? (
      <View testID="item-add-run">
        <SurfaceCard>
          <StartRun
            key={`${subscription.id}:${item.id}`}
            subscriptionId={subscription.id}
            shownWorkspaceId={page.loadedFor}
            runInput={subscription.runInput ?? []}
            itemId={form.itemId ?? item.id}
            startLabel={START_LABEL}
            showTypes
            // The new run joins the list, "Reading…", and is read with it.
            onStarted={() => refresh()}
          />
        </SurfaceCard>
      </View>
    ) : null;

  return (
    <Page testID="item-screen">
      <PageHeader
        onBack={() => router.back()}
        title={item.title}
        titleTestID="item-title"
        selectable
        below={
          <Text
            testID="item-status"
            style={[styles.sub, { color: item.status === 'failed' ? status.err : palette.neutral[400] }]}>
            {itemStatusLine(item, declared.groupField)}
          </Text>
        }
      />

      <BlockList
        testID="item-blocks"
        blocks={blocks}
        context={{ runOrigin: 'flows', forms: { run: runForm }, workspaceId: page.loadedFor }}
      />

      {/* Last, in red, where a person scrolls to it — as the flow's own Archive (24.9.4); the
          run page's danger pill since Round 21 (~~drawn by hand~~; checklist C, "Buttons"). */}
      {canManage && !archived ? (
        <PillButton
          testID="item-archive"
          label={archiveItemLabel(declared.words)}
          accessibilityLabel={archiveItemTitle(item.title)}
          variant="danger"
          fontSize={typeScale.label.fontSize}
          icon={Archive}
          iconSize={iconSize.button}
          onPress={() => {
            setArchiveError(null);
            setArchiveOpen(true);
          }}
        />
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
    </Page>
  );
}

const styles = StyleSheet.create({
  sub: { fontFamily: fonts.regular, fontSize: typeScale.body.fontSize },
});
