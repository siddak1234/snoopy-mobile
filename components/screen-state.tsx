import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArrowClockwise, WarningCircle, WifiSlash, type Icon } from 'phosphor-react-native';

import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { Skeleton } from '@/components/nocturne/skeleton';
import { em, fonts, layout, status, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  BACK_LABEL,
  ERROR_BODY,
  OFFLINE_BODY,
  OFFLINE_TITLE,
  RETRY_LABEL,
} from '@/lib/content/screen-states';

/**
 * The data states every fetching screen shares — `gLoad`, `gErr`, `gOff`.
 *
 * These live outside `components/nocturne/` on purpose. The Nocturne set is the
 * frozen eighteen-component design vocabulary; these are app-level compositions
 * *of* that vocabulary — Skeleton, BackCircle and PillButton — and add no new
 * primitive. The design generalised the same way: rather than a bespoke state
 * per screen it derives `gLoad`/`gErr`/`gOff` for every screen except Home,
 * which keeps the bespoke ones it already had.
 *
 * Home is deliberately not refactored onto these. Its loading skeleton mirrors
 * its own stat/banner/run layout and its empty state is a first-run invitation
 * with two actions, neither of which generalises — and rewriting a screen whose
 * appearance is already correct is exactly the churn the frozen-UI rule exists
 * to prevent.
 */

/**
 * The design bakes a ~59pt status area into its fixed 74px top padding; live
 * screens add the real safe-area inset instead. Same arithmetic every screen
 * already uses, named once here.
 */
const DESIGN_TOP = layout.designTop.app - layout.statusArea;

/**
 * `gLoad` — a skeleton in the screen's own shape.
 *
 * `tiles` is the design's `gLoadTiles`, shown on run and workflow detail because
 * both open with a row of stat tiles. The stagger (0 → .72s) is the design's own
 * `a8xSkel` delay ramp, so the pulse travels down the screen rather than
 * flashing as one block.
 */
export function ScreenLoading({ tiles = false, topInset = 0 }: { tiles?: boolean; topInset?: number }) {
  const { palette } = useTheme();
  return (
    <View
      testID="screen-loading"
      style={[styles.root, { paddingTop: topInset + DESIGN_TOP, backgroundColor: palette.bg }]}>
      <View style={styles.headerRow}>
        <Skeleton width={36} height={36} borderRadius={999} />
        <View style={styles.headerText}>
          <Skeleton width={148} height={18} borderRadius={8} />
          <Skeleton width={96} height={12} delay={100} />
        </View>
      </View>

      {tiles ? (
        <View style={styles.tilesRow}>
          <Skeleton flex height={62} borderRadius={14} />
          <Skeleton flex height={62} borderRadius={14} delay={120} />
          <Skeleton flex height={62} borderRadius={14} delay={240} />
        </View>
      ) : null}

      <Skeleton width={88} height={10} delay={300} />

      <View style={styles.rows}>
        <Skeleton height={64} borderRadius={14} delay={360} />
        <Skeleton height={64} borderRadius={14} delay={480} />
        <Skeleton height={64} borderRadius={14} delay={600} />
        <Skeleton height={64} borderRadius={14} delay={720} />
      </View>
    </View>
  );
}

/** The hero + copy + actions shared by the two failure states. */
function FailureBody({
  icon,
  title,
  body,
  onRetry,
  onBack,
  backLabel,
  testID,
  topInset,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  onRetry?: () => void;
  onBack?: () => void;
  backLabel?: string;
  testID: string;
  topInset: number;
}) {
  const { palette } = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.root, { paddingTop: topInset + DESIGN_TOP, backgroundColor: palette.bg }]}>
      <BackCircle onPress={onBack} />
      <View style={styles.center}>
        <View style={[styles.hero, { borderColor: palette.neutral[800] }]}>{icon}</View>
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.body, { color: palette.neutral[400] }]}>{body}</Text>
        <PillButton
          label={RETRY_LABEL}
          variant="primary"
          height={44}
          fontSize={14}
          icon={ArrowClockwise}
          iconSize={16}
          gap={8}
          onPress={onRetry}
          style={styles.retry}
        />
        {backLabel ? (
          <PillButton label={backLabel} variant="plain" height={40} fontSize={13.5} onPress={onBack} />
        ) : null}
      </View>
    </View>
  );
}

/**
 * `gErr` — the platform answered and refused.
 *
 * `title` names the thing that failed rather than the mechanism ("Couldn't load
 * this run"), which is why it is a per-screen string from
 * `lib/content/screen-states.ts` rather than an error message rendered raw. A
 * server's own words are not something a screen should put in a headline.
 */
export function ScreenError({
  title,
  onRetry,
  onBack,
  topInset = 0,
}: {
  title: string;
  onRetry?: () => void;
  onBack?: () => void;
  topInset?: number;
}) {
  const { palette } = useTheme();
  return (
    <FailureBody
      testID="screen-error"
      icon={<WarningCircle size={36} color={palette.neutral[500]} />}
      title={title}
      body={ERROR_BODY}
      onRetry={onRetry}
      onBack={onBack}
      backLabel={BACK_LABEL}
      topInset={topInset}
    />
  );
}

/**
 * `gOff` — the request never landed.
 *
 * No "Go back": the design offers only Retry, because nothing is wrong with the
 * platform and the screen will simply fill in once the device is back.
 */
export function ScreenOffline({
  onRetry,
  onBack,
  topInset = 0,
}: {
  onRetry?: () => void;
  onBack?: () => void;
  topInset?: number;
}) {
  const { palette } = useTheme();
  return (
    <FailureBody
      testID="screen-offline"
      icon={<WifiSlash size={36} color={palette.neutral[500]} />}
      title={OFFLINE_TITLE}
      body={OFFLINE_BODY}
      onRetry={onRetry}
      onBack={onBack}
      topInset={topInset}
    />
  );
}

/**
 * A first-run empty — an invitation, not an apology.
 *
 * Home's `sHomeEmpty` set this grammar and the design reused it for Flows and
 * Activity: an accent-tinted hero, a headline, one sentence, and somewhere to go.
 * The hero is deliberately the accent treatment rather than the neutral one the
 * failure states use — nothing has gone wrong here, so it must not look like it
 * has. `action` is optional because the notifications empty state has none: an
 * empty inbox is the product's own rule working, not something to fix.
 */
export function ScreenEmpty({
  icon,
  title,
  body,
  action,
  secondaryAction,
  topInset = 0,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: { label: string; icon?: Icon; onPress?: () => void };
  secondaryAction?: { label: string; onPress?: () => void };
  topInset?: number;
}) {
  const { palette } = useTheme();
  return (
    <View
      testID="screen-empty"
      style={[styles.root, { paddingTop: topInset + DESIGN_TOP, backgroundColor: palette.bg }]}>
      <View style={styles.center}>
        <View
          style={[
            styles.emptyHero,
            { borderColor: palette.accentRamp[700], backgroundColor: withAlpha(palette.accent, 0.1) },
          ]}>
          {icon}
        </View>
        <Text style={[styles.emptyTitle, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.body, { color: palette.neutral[400] }]}>{body}</Text>
        {action ? (
          <PillButton
            label={action.label}
            variant="primary"
            height={48}
            {...(action.icon ? { icon: action.icon, iconSize: 18 } : {})}
            onPress={action.onPress}
            style={styles.emptyCta}
          />
        ) : null}
        {secondaryAction ? (
          <PillButton
            label={secondaryAction.label}
            variant="plain"
            height={44}
            fontSize={14.5}
            onPress={secondaryAction.onPress}
            style={styles.emptySecondary}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * The inline action-failure callout — one grammar for every failed action.
 *
 * The design ratified this boundary: a failed *action* on data that already
 * loaded never replaces the screen. The callout names what did **not** happen
 * ("Email triage wasn't removed — it's still active and your plan total is
 * unchanged") and the data stays where the person left it. One shape serves
 * pause/resume, removal, retry, cancel, decision sync, OAuth and sign-out.
 */
export function ActionFailure({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry?: () => void;
}) {
  const { palette } = useTheme();
  return (
    <View
      testID="action-failure"
      accessibilityRole="alert"
      style={[
        styles.callout,
        { borderColor: status.errBorder, backgroundColor: withAlpha(status.err, 0.1) },
      ]}>
      <WarningCircle size={18} color={status.err} />
      <View style={styles.calloutBody}>
        <Text style={[styles.calloutText, { color: palette.text }]}>{message}</Text>
        <Text
          onPress={onRetry}
          suppressHighlighting
          accessibilityRole="button"
          style={[styles.calloutAction, { color: status.err }]}>
          {retryLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: layout.screenX,
    paddingBottom: 20,
    gap: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { gap: 7 },
  tilesRow: { flexDirection: 'row', gap: 10 },
  rows: { gap: 8 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 20,
  },
  hero: {
    width: 80,
    height: 80,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 8,
    fontFamily: fonts.medium,
    fontSize: 20,
    letterSpacing: em(-0.01, 20),
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.55,
    textAlign: 'center',
    maxWidth: 224,
  },
  retry: { marginTop: 8, paddingHorizontal: 26 },
  emptyHero: {
    width: 88,
    height: 88,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginTop: 8,
    fontFamily: fonts.medium,
    fontSize: 22,
    letterSpacing: em(-0.015, 22),
    textAlign: 'center',
  },
  emptyCta: { marginTop: 8, alignSelf: 'stretch' },
  emptySecondary: { alignSelf: 'stretch' },
  callout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  calloutBody: { flex: 1, gap: 6 },
  calloutText: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 13 * 1.5 },
  calloutAction: { fontFamily: fonts.medium, fontSize: 13 },
});
