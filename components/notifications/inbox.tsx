import { useRouter } from 'expo-router';
import { BellRinging, CheckCircle, CrownSimple, HandPalm, X, XCircle } from 'phosphor-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Pressable, pressed } from '@/components/pressable';
import { em, fonts, layout, status, typeScale, withAlpha } from '@/constants/theme';
import { usePushAsk } from '@/hooks/use-push-registration';
import { useTheme } from '@/hooks/use-theme';
import type { NotificationItem } from '@/lib/view/runs';
import { readCatalog } from '@/lib/platform/catalog';
import { newIdempotencyKey } from '@/lib/platform/client';
import { dismissInboxItem, markInboxRead, readInbox } from '@/lib/platform/notifications';
import { catalogIndex, inboxRows } from '@/lib/view/runs';
import { useWorkspaceResource, busyBody } from '@/hooks/use-resource';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { ScreenEmpty, ScreenError, ScreenUnavailable, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import {
  NOTIFICATIONS_EMPTY_BODY,
  NOTIFICATIONS_EMPTY_TITLE,
  PUSH_CARD_BODY,
  PUSH_CARD_TITLE,
  PUSH_DENIED_BODY,
  PUSH_FAILED,
  PUSH_LATER_BUILD_BODY,
  PUSH_NOT_NOW_LABEL,
  PUSH_NOT_ON_BUILD_BODY,
  PUSH_NOT_YET_BODY,
  PUSH_OPEN_SETTINGS_LABEL,
  PUSH_TURN_ON_LABEL,
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
 * Notifications inbox (design `sNotifs`), with the card that asks for device
 * push (build 11, D8).
 *
 * Reached from Home's bell and from Settings › Notifications, each in its own
 * stack: a run opened from the Settings copy opens in Settings too, so Back
 * returns to Settings rather than switching to Home (24.12, the owner's
 * default: "Settings › Notifications shows the inbox itself"). A held run
 * opens Approvals from either, where it is decided — the website's page for it
 * — as a push for one does (Gate 24's parity pass; Activity until then).
 */
export function Inbox({ runPath }: { runPath: InboxRunPath }) {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  /**
   * The platform's inbox (the owner's build 13 decision 3A, reversing §12.1 #71):
   * held runs awaiting a decision and failed runs — what the product notifies on,
   * as the design's own empty state says — each with whether this person has read
   * it, and nothing they dismissed. Read and dismissed are the platform's, so every
   * device and the bell agree.
   */
  const session = useSession();
  const inbox = useWorkspaceResource(async (workspaceId) => {
    const [read, catalog] = await Promise.all([readInbox(workspaceId), readCatalog(workspaceId)]);
    return inboxRows(read.items, catalogIndex(catalog.automations));
  });

  // Rows dismissed here leave the screen at the tap, before the platform answers.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const items: NotificationItem[] =
    inbox.status === 'ready'
      ? inbox.data.filter((n) => !dismissed.has(n.id)).map((n) => ({ ...n, icon: NOTIFICATION_ICON[n.tone] }))
      : [];

  // What a read or dismissal answered, when it was refused.
  const [actionError, setActionError] = useState<string | null>(null);
  // The workspace the rows on screen were read for: what an action binds to.
  const shownWorkspace = () => {
    const workspaceId = workspaceIfShown(session, inbox.loadedFor);
    if (!workspaceId) setActionError(WORKSPACE_CHANGED);
    return workspaceId;
  };
  // A save re-reads the inbox in place, keeping the rows on screen until the
  // platform answers (`refresh`, not `reload`: no skeleton to confirm a dot). The
  // save dropped the inbox from the snapshot, so the re-read is a real request.
  // Whether it saved: a dismissal puts its row back when it did not.
  const act = async (change: (workspaceId: string) => Promise<unknown>): Promise<boolean> => {
    const workspaceId = shownWorkspace();
    if (!workspaceId) return false;
    setActionError(null);
    try {
      await change(workspaceId);
      inbox.refresh();
      return true;
    } catch (caught) {
      setActionError(refusalMessage(caught, {}, 'That did not save. Try again.'));
      return false;
    }
  };
  // The rows on screen, by id, not "everything listed now": an item that arrives
  // after the inbox was drawn is still unread (DESIGN-GAPS).
  const markAllRead = () => {
    const unread = items.filter((item) => item.unread).map((item) => item.id);
    if (unread.length === 0) return;
    void act((workspaceId) => markInboxRead(workspaceId, unread, newIdempotencyKey('notifications-read')));
  };
  /**
   * Dismiss takes the row away at the tap — the owner's build 14 feedback #10,
   * "I had to click the x three times": the row stayed until the platform had
   * answered and the inbox was read again, a second or two with nothing to show
   * the tap had landed. Refused, the row comes back with the reason above the list.
   */
  const dismiss = (item: NotificationItem) => {
    setDismissed((current) => new Set(current).add(item.id));
    void act((workspaceId) => dismissInboxItem(workspaceId, item.id, newIdempotencyKey('notification-dismiss'))).then(
      (saved) => {
        if (saved) return;
        setDismissed((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      },
    );
  };

  // Every hook is above this line on purpose: the guards below return early, and
  // a hook called after them would run on some renders and not others.

  if (inbox.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (inbox.status === 'offline') {
    return <ScreenOffline onRetry={() => inbox.reload()} onBack={() => router.back()} topInset={insets.top} />;
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
        onRetry={() => inbox.reload()} body={busyBody(inbox)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  if (items.length === 0) {
    // Not an apology: an empty inbox is the product's rule working, which is why
    // the design gives this state no action. The push ask sits above it all the
    // same (the owner, build 11, 2026-10-03: "Also on empty"): otherwise a person
    // with nothing held or failed could not turn push on anywhere, Settings ›
    // Notifications included. The design draws `pushAsk` above `notifsEmpty`.
    return (
      <ScreenEmpty
        icon={<BellRinging size={40} color={palette.accentRamp[300]} />}
        title={NOTIFICATIONS_EMPTY_TITLE}
        body={NOTIFICATIONS_EMPTY_BODY}
        above={<PushCard />}
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
    // Opening an item reads it, as a notification does anywhere: saved on the
    // platform, without holding the way on.
    if (item.unread) void act((workspaceId) => markInboxRead(workspaceId, [item.id], newIdempotencyKey('notifications-read')));
    if (item.target === 'run') {
      router.push({
        pathname: runPath,
        // A composed row points at a real run when it has one; the prototype's
        // `runVariant` is gone with the fixtures.
        params: item.runId ? { runId: item.runId } : {},
      });
    } else if (item.target === 'approvals') {
      router.push('/(tabs)/activity/approvals');
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
          onPress={pressed(markAllRead)}
          suppressHighlighting
          style={[styles.markAll, { color: palette.accentRamp[300] }]}>
          Mark all read
        </Text>
      </View>

      <PushCard />

      {actionError ? <Text style={[styles.rowDesc, { color: status.err }]}>{actionError}</Text> : null}

      <SurfaceCard style={styles.list}>
        {items.map((item, i) => {
          const IconCmp = item.icon;
          const unread = item.unread;
          return (
            <View
              key={item.id}
              style={[
                styles.rowWrap,
                i < items.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: palette.divider,
                },
              ]}>
              <Pressable
                onPress={() => open(item)}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: withAlpha(palette.text, 0.04) }]}>
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
              {/* Dismiss, beside the row rather than inside it (decision 3A): a press
                  inside the row would be grouped into it, out of VoiceOver's reach.
                  It leaves the inbox on every device. A 44-point square, the ✕ where
                  it was drawn, and no slop reaching into the row it sits beside. */}
              <Pressable
                testID={`dismiss-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Dismiss: ${item.title}`}
                onPress={() => dismiss(item)}
                style={({ pressed }) => [styles.dismiss, pressed && { backgroundColor: withAlpha(palette.text, 0.06) }]}>
                <X size={15} color={palette.neutral[500]} />
              </Pressable>
            </View>
          );
        })}
      </SurfaceCard>
    </ScrollView>
  );
}

/**
 * The ask for device push (build 11, D8): the design's own card, in the
 * owner's words. "Turn on" is the only place the app asks — iOS prompts at the
 * tap — and "Not now" holds for the session. A phone that cannot be asked is
 * told why, with nothing to turn on: Android or a simulator, a platform from
 * before the devices route, a build with no push token. Registered, there is
 * no card.
 */
function PushCard() {
  const { palette } = useTheme();
  const { ask, busy, turnOn, notNow, openSettings } = usePushAsk();
  if (ask.kind === 'none') return null;

  const body =
    ask.kind === 'denied'
      ? PUSH_DENIED_BODY
      : ask.kind === 'unsupported'
        ? PUSH_LATER_BUILD_BODY
        : ask.kind === 'not-yet'
          ? PUSH_NOT_YET_BODY
          : ask.kind === 'no-build'
            ? PUSH_NOT_ON_BUILD_BODY
            : PUSH_CARD_BODY;

  return (
    <View
      testID="push-card"
      style={[
        styles.pushCard,
        {
          borderColor: palette.accentRamp[700],
          backgroundColor: withAlpha(palette.accent, 0.09),
        },
      ]}>
      <View style={styles.pushHead}>
        <BellRinging size={21} color={palette.accentRamp[300]} />
        <Text style={[styles.pushTitle, { color: palette.text }]}>{PUSH_CARD_TITLE}</Text>
      </View>
      <Text style={[styles.pushBody, { color: palette.neutral[400] }]}>{body}</Text>
      {ask.kind === 'ask' && ask.failed ? (
        <Text style={[styles.pushFailed, { color: status.err }]}>{PUSH_FAILED}</Text>
      ) : null}
      <View style={styles.pushActions}>
        {ask.kind === 'ask' ? (
          <PillButton
            label={PUSH_TURN_ON_LABEL}
            variant="primary"
            height={42}
            fontSize={typeScale.body.fontSize}
            disabled={busy}
            onPress={() => void turnOn()}
            style={styles.pushBtn}
          />
        ) : null}
        {ask.kind === 'denied' ? (
          <PillButton
            label={PUSH_OPEN_SETTINGS_LABEL}
            variant="primary"
            height={42}
            fontSize={typeScale.body.fontSize}
            onPress={() => openSettings()}
            style={styles.pushBtn}
          />
        ) : null}
        <PillButton
          label={PUSH_NOT_NOW_LABEL}
          variant="plain"
          height={42}
          fontSize={typeScale.body.fontSize}
          onPress={() => void notNow()}
          style={styles.pushBtn}
        />
      </View>
    </View>
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
  pushFailed: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  pushActions: {
    flexDirection: 'row',
    gap: 10,
  },
  pushBtn: {
    flex: 1,
  },
  list: {},
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  row: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 13,
    paddingLeft: 14,
    paddingRight: 8,
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
  // Apple's 44-point minimum. The 15-point ✕ centred in it sits 14.5 from the top
  // and the card's edge, where the padded ✕ was drawn.
  dismiss: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
