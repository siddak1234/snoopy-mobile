import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArrowClockwise, WarningCircle, WifiSlash, type Icon } from 'phosphor-react-native';

import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { Skeleton } from '@/components/nocturne/skeleton';
import { pressed } from '@/components/pressable';
import { em, fonts, layout, status, typeScale, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  BACK_LABEL,
  ERROR_BODY,
  UNAVAILABLE_BODY,
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
          fontSize={typeScale.label.fontSize}
          icon={ArrowClockwise}
          iconSize={16}
          gap={8}
          onPress={onRetry}
          style={styles.retry}
        />
        {backLabel ? (
          <PillButton label={backLabel} variant="plain" height={40} fontSize={typeScale.body.fontSize} onPress={onBack} />
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
  body,
  onRetry,
  onBack,
  topInset = 0,
}: {
  title: string;
  /** The design's body unless a 429 stated its wait (`busyBody`, BUILD-PLAN 24.3.3). */
  body?: string;
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
      body={body ?? ERROR_BODY}
      onRetry={onRetry}
      onBack={onBack}
      backLabel={BACK_LABEL}
      topInset={topInset}
    />
  );
}

/**
 * The build or the session cannot make this request at all.
 *
 * Distinct from `gErr` because Retry is a lie here. A `PlatformNotConfiguredError`
 * means either no backend origin is configured or no workspace has resolved —
 * neither of which a second attempt changes, so offering "Retry now or come
 * back in a moment" invites a person to press a button that can never succeed.
 * The design has no fourth failure hero, so this reuses `gErr`'s treatment and
 * changes only what it says and what it offers.
 */
export function ScreenUnavailable({
  title,
  onBack,
  topInset = 0,
}: {
  title: string;
  onBack?: () => void;
  topInset?: number;
}) {
  const { palette } = useTheme();
  return (
    <FailureBody
      testID="screen-unavailable"
      icon={<WarningCircle size={36} color={palette.neutral[500]} />}
      title={title}
      body={UNAVAILABLE_BODY}
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
 *
 * Since the owner's decision 6 of 2026-10-02 (24.12) every whole screen with
 * nothing on it draws this — a pushed screen with `onBack`, which draws the
 * failure states' back control; without it the render is as it always was. A
 * screen whose empty says only its title leaves out `body`. `above` is drawn
 * under the way back and above the centred block, which stays centred in what
 * is left: the inbox's push ask, which the owner put on the empty inbox too
 * (build 11, 2026-10-03: "Also on empty"), as the design draws `pushAsk` above
 * `notifsEmpty`. Without it the render is unchanged.
 */
export function ScreenEmpty({
  icon,
  title,
  body,
  action,
  secondaryAction,
  above,
  onBack,
  topInset = 0,
}: {
  icon: React.ReactNode;
  title: string;
  body?: string;
  action?: { label: string; icon?: Icon; onPress?: () => void };
  secondaryAction?: { label: string; onPress?: () => void };
  /** Drawn above the centred block, under the way back (the inbox's push ask). */
  above?: React.ReactNode;
  /** A pushed screen's way back. */
  onBack?: () => void;
  topInset?: number;
}) {
  const { palette } = useTheme();
  return (
    <View
      testID="screen-empty"
      style={[styles.root, { paddingTop: topInset + DESIGN_TOP, backgroundColor: palette.bg }]}>
      {onBack ? <BackCircle onPress={onBack} /> : null}
      {above}
      <View style={styles.center}>
        <View
          style={[
            styles.emptyHero,
            { borderColor: palette.accentRamp[700], backgroundColor: withAlpha(palette.accent, 0.1) },
          ]}>
          {icon}
        </View>
        <Text style={[styles.emptyTitle, { color: palette.text }]}>{title}</Text>
        {body ? <Text style={[styles.body, { color: palette.neutral[400] }]}>{body}</Text> : null}
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
            fontSize={typeScale.label.fontSize}
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
          onPress={pressed(onRetry)}
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
    fontSize: typeScale.title.fontSize,
    letterSpacing: em(-0.01, typeScale.title.fontSize),
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.regular,
    ...typeScale.body,
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
    fontSize: typeScale.heading.fontSize,
    letterSpacing: em(-0.015, typeScale.heading.fontSize),
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
  calloutText: { fontFamily: fonts.regular, ...typeScale.body },
  calloutAction: { fontFamily: fonts.medium, fontSize: typeScale.body.fontSize },
});
