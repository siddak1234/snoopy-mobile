import { useRouter } from 'expo-router';
import { BellRinging, CheckCircle, CrownSimple, HandPalm, XCircle } from 'phosphor-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, status, typeScale, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NotificationItem } from '@/lib/view/runs';
import { readCatalog } from '@/lib/platform/catalog';
import { readApprovals, readRuns, readSubscriptions } from '@/lib/platform/runs';
import { catalogIndex, composeNotifications, subscriptionIndex } from '@/lib/view/runs';
import { useWorkspaceResource, busyBody } from '@/hooks/use-resource';
import { ScreenEmpty, ScreenError, ScreenUnavailable, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import {
  NOTIFICATIONS_EMPTY_BODY,
  NOTIFICATIONS_EMPTY_TITLE,
  errorTitleFor,
} from '@/lib/content/screen-states';

/** Where a failed run's page opens: in the stack its inbox was reached in. */
export type InboxRunPath = '/(tabs)/(home)/run' | '/(tabs)/settings/run';

/** Tone → glyph, so a composed row draws what the design draws for that kind. */
const NOTIFICATION_ICON = {
  ok: CheckCircle,
  warn: HandPalm,
  err: XCircle,
  accent: CrownSimple,
} as const;

/**
 * Notifications inbox (design `sNotifs`) with an in-app-only notice.
 *
 * Reached from Home's bell and from Settings › Notifications, each in its own
 * stack: a run opened from the Settings copy opens in Settings too, so Back
 * returns to Settings rather than switching to Home (24.12, the owner's
 * default: "Settings › Notifications shows the inbox itself"). A held run
 * opens Activity from either, as it always has.
 */
export function Inbox({ runPath }: { runPath: InboxRunPath }) {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  /**
   * There is no notifications route, so the inbox is composed.
   *
   * §12.1 #71 refuses one and names the composition: held runs awaiting a
   * decision, plus failed runs. That is exactly what the product notifies on,
   * and the design's own empty state says so — "We only notify you for held runs
   * and failures."
   *
   * It cannot remember what was already seen: read state is an unbuilt
   * subsystem, so every row reports itself unread. Keeping a local read flag
   * would make two devices disagree about the same inbox, which is worse than
   * the honest limitation.
   */
  const inbox = useWorkspaceResource(async (workspaceId) => {
    const [approvals, runs, subs, catalog] = await Promise.all([
      readApprovals(workspaceId, 'pending'),
      readRuns(workspaceId),
      readSubscriptions(workspaceId),
      readCatalog(workspaceId),
    ]);
    return composeNotifications(
      approvals.approvals,
      runs.runs.filter((r) => r.status === 'failed'),
      subscriptionIndex(subs.subscriptions),
      catalogIndex(catalog.automations),
    );
  });

  const items: NotificationItem[] =
    inbox.status === 'ready'
      ? inbox.data.map((n) => ({ ...n, icon: NOTIFICATION_ICON[n.tone] }))
      : [];

  // The platform publishes an in-app composition, not a device-push contract.
  // This card says that plainly and is dismiss-only; it never imitates an OS
  // permission grant.
  const [askPush, setAskPush] = useState(true);
  // The rows "Mark all read" covered, by id: a row a later re-read brings in
  // is still unread.
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set());

  // Every hook is above this line on purpose: the guards below return early, and
  // a hook called after them would run on some renders and not others.

  if (inbox.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (inbox.status === 'offline') {
    return <ScreenOffline onRetry={inbox.reload} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (inbox.status === 'unconfigured') {
    return (
      <ScreenUnavailable
        title={errorTitleFor('notifications')}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  if (inbox.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('notifications')}
        onRetry={inbox.reload} body={busyBody(inbox)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  if (items.length === 0) {
    // Not an apology: an empty inbox is the product's rule working, which is why
    // the design gives this state no action.
    return (
      <ScreenEmpty
        icon={<BellRinging size={40} color={palette.accentRamp[300]} />}
        title={NOTIFICATIONS_EMPTY_TITLE}
        body={NOTIFICATIONS_EMPTY_BODY}
        // A pushed screen: the standard's way back (24.12).
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  const toneColor = (tone: NotificationItem['tone']) =>
    tone === 'ok'
      ? status.ok
      : tone === 'warn'
        ? status.warnText
        : tone === 'err'
          ? status.err
          : palette.accentRamp[300];

  const open = (item: NotificationItem) => {
    if (item.target === 'run') {
      router.push({
        pathname: runPath,
        // A composed row points at a real run when it has one; the prototype's
        // `runVariant` is gone with the fixtures.
        params: item.runId ? { runId: item.runId } : {},
      });
    } else if (item.target === 'activity') {
      router.push('/(tabs)/activity');
    } else {
      router.push('/(tabs)/settings');
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <Text style={[styles.title, { color: palette.text }]}>Notifications</Text>
        <Text
          onPress={() => setReadIds(new Set(items.map((item) => item.id)))}
          suppressHighlighting
          style={[styles.markAll, { color: palette.accentRamp[300] }]}>
          Mark all read
        </Text>
      </View>

      {askPush ? (
        <View
          style={[
            styles.pushCard,
            {
              borderColor: palette.accentRamp[700],
              backgroundColor: withAlpha(palette.accent, 0.09),
            },
          ]}>
          <View style={styles.pushHead}>
            <BellRinging size={21} color={palette.accentRamp[300]} />
            <Text style={[styles.pushTitle, { color: palette.text }]}>
              Know the moment something needs you
            </Text>
          </View>
          <Text style={[styles.pushBody, { color: palette.neutral[400] }]}>
            This build shows held runs and failures in this in-app inbox. Device push delivery is
            not configured.
          </Text>
          <View style={styles.pushActions}>
            <PillButton
              label="Got it"
              variant="primary"
              height={42}
              fontSize={typeScale.body.fontSize}
              onPress={() => setAskPush(false)}
              style={styles.pushBtn}
            />
            <PillButton
              label="Dismiss"
              variant="plain"
              height={42}
              fontSize={typeScale.body.fontSize}
              onPress={() => setAskPush(false)}
              style={styles.pushBtn}
            />
          </View>
        </View>
      ) : null}

      <SurfaceCard style={styles.list}>
        {items.map((item, i) => {
          const IconCmp = item.icon;
          const unread = item.unread && !readIds.has(item.id);
          return (
            <Pressable
              key={item.id}
              onPress={() => open(item)}
              style={({ pressed }) => [
                styles.row,
                i < items.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: palette.divider,
                },
                pressed && { backgroundColor: withAlpha(palette.text, 0.04) },
              ]}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: unread ? palette.accent : 'transparent' },
                ]}
              />
              <IconCmp size={19} color={toneColor(item.tone)} style={styles.rowIcon} />
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: palette.text }]}>{item.title}</Text>
                <Text style={[styles.rowDesc, { color: palette.neutral[400] }]}>{item.desc}</Text>
              </View>
              <Text style={[styles.rowTime, { color: palette.neutral[500] }]}>{item.time}</Text>
            </Pressable>
          );
        })}
      </SurfaceCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenX,
    paddingBottom: 20,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typeScale.heading.fontSize,
    letterSpacing: em(-0.01, typeScale.heading.fontSize),
  },
  markAll: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  pushCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 15,
    gap: 10,
  },
  pushHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  pushTitle: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typeScale.label.fontSize,
  },
  pushBody: {
    fontFamily: fonts.regular,
    ...typeScale.body,
  },
  pushActions: {
    flexDirection: 'row',
    gap: 10,
  },
  pushBtn: {
    flex: 1,
  },
  list: {},
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    marginTop: 6,
  },
  rowIcon: {
    marginTop: 1,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label.fontSize,
  },
  rowDesc: {
    marginTop: 1,
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  rowTime: {
    fontFamily: fonts.regular,
    fontSize: typeScale.caption.fontSize,
  },
});
