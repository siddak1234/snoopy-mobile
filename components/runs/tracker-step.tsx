import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/text';
import { fonts, iconSize, inset, space, status, typeScale } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTheme } from '@/hooks/use-theme';
import type { TrackerRow } from '@/lib/view/runs';

/**
 * A working step's icon turns (round 23, A4 — the owner's build 22 item 7: the
 * running step spins): a full turn every 900 ms, steadily, for as long as the
 * step works; still and upright under Reduce Motion.
 */
function StepSpinner({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    // Reduce Motion is known only after the first frame (`useReducedMotion`
    // answers off until the system does): a turn already started is stopped
    // and set upright, never left tilted where it stopped.
    if (reduceMotion) {
      cancelAnimation(turn);
      turn.value = 0;
      return;
    }
    turn.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [reduceMotion, turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return (
    <Animated.View testID="run-step-spinner" style={[styles.trackerIcon, spin]}>
      {children}
    </Animated.View>
  );
}

/**
 * One row of STEPS — Run details' and a timeline block's (backend ADR-0048
 * decision 8; moved out of run-details.tsx in Round 21) — (Build 21, spec A7; the owner's build 20 item 10: "It
 * shoukd show all the steps and a live tracker of which ones are done"): "2 ·
 * Read", its state's icon at 24 and its state in words — Waiting, Working…,
 * Done and when, Waiting for approval and why, the run's failure, Skipped or
 * Stopped — never a step's own summary and never a step id (B6). A held step
 * says where it stands; its Approve and Deny are on the run's page (round 24
 * P6; build 28's review).
 */
export function TrackerStep({ row, divider }: { row: TrackerRow; divider: boolean }) {
  const { palette } = useTheme();
  const tone =
    row.tone === 'ok'
      ? status.ok
      : row.tone === 'warn'
        ? status.warnText
        : row.tone === 'err'
          ? status.err
          : row.tone === 'accent'
            ? palette.accentRamp[300]
            : palette.neutral[500];
  const IconCmp = row.icon;
  const quiet = row.state === 'waiting' || row.state === 'skipped' || row.state === 'stopped' || row.state === 'unknown';
  return (
    <View
      testID={`run-step-${row.id}`}
      style={[styles.trackerRow, divider && { borderBottomWidth: 1, borderBottomColor: palette.divider }]}>
      {row.state === 'working' ? (
        <StepSpinner>
          <IconCmp size={iconSize.row} color={tone} />
        </StepSpinner>
      ) : (
        <IconCmp size={iconSize.row} color={tone} style={styles.trackerIcon} />
      )}
      <View style={styles.trackerBody}>
        <Text style={[styles.trackerTitle, { color: quiet ? palette.neutral[400] : palette.text }]}>{row.title}</Text>
        {/* A platform step this build does not know has no state, so no line (backend ADR-0041). */}
        {row.sub ? (
          <Text style={[styles.trackerSub, { color: row.tone === 'muted' ? palette.neutral[500] : tone }]}>{row.sub}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  trackerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.inner,
    paddingVertical: space.rowY,
    paddingHorizontal: space.rowX,
  },
  trackerIcon: {
    marginTop: inset.hair,
  },
  trackerBody: {
    flex: 1,
  },
  trackerTitle: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label.fontSize,
  },
  trackerSub: {
    marginTop: inset.hair,
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
});
