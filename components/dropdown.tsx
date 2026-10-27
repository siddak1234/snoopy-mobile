import { Check, type Icon } from 'phosphor-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { GlassSurface } from '@/components/glass-surface';
import { Pressable } from '@/components/pressable';
import { Text } from '@/components/text';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { elevation, em, fonts, fontScaleLimit, space, status as statusColor, typeScale, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type DropdownOption<T extends string> = { value: T; label: string; sub?: string; icon?: Icon; testID?: string };

/** Where a trigger is on the screen, as `measureInWindow` reports it. */
export type DropdownAnchor = { x: number; y: number; width: number; height: number };

/** The screen's sides the panel keeps clear of. */
const GUTTER = 16;
/** Between the trigger and the panel. */
const GAP = 6;
/** The least room below for the panel to open below while there is more above. */
const ROOM_BELOW = 240;
const MIN_WIDTH = 232;
const MAX_HEIGHT = 380;
const RADIUS = 18;

export type DropdownFrame = {
  left: number;
  width: number;
  maxHeight: number;
  /** Set when the panel opens below its trigger. */
  top?: number;
  /** Set when it opens above: the distance from the screen's bottom. */
  bottom?: number;
  placement: 'below' | 'above';
  align: 'start' | 'end';
};

/**
 * Where a panel goes (the owner's build 22 items 3–4, D1): under its trigger
 * 6 pt down, or over it when there are fewer than 240 pt below and more above;
 * on the trigger's start or end edge — the screen edge it is nearer, unless the
 * page says — 16 pt clear of each side; at least 232 wide times the phone's
 * text size (up to `fontScaleLimit.content`; ~~232 at every size~~ until round
 * 24's simulator audit, where the largest size cut "Harbor…" and "All categ…"),
 * the trigger's width if wider, never wider than the screen less its gutters;
 * at most 380 tall, and never taller than its room less 16. Pure, so the sums
 * are tested on their own.
 */
export function placeDropdown(
  anchor: DropdownAnchor,
  screen: { width: number; height: number; fontScale?: number },
  align?: 'start' | 'end',
): DropdownFrame {
  const side = align ?? (anchor.x + anchor.width / 2 < screen.width / 2 ? 'start' : 'end');
  const least = MIN_WIDTH * Math.min(Math.max(screen.fontScale ?? 1, 1), fontScaleLimit.content);
  const width = Math.min(Math.max(anchor.width, least), screen.width - GUTTER * 2);
  const wanted = side === 'start' ? anchor.x : anchor.x + anchor.width - width;
  const left = Math.min(Math.max(wanted, GUTTER), screen.width - GUTTER - width);
  const below = screen.height - (anchor.y + anchor.height + GAP);
  const above = anchor.y - GAP;
  if (below < ROOM_BELOW && above > below) {
    return {
      left,
      width,
      bottom: screen.height - above,
      maxHeight: Math.min(MAX_HEIGHT, above - GUTTER),
      placement: 'above',
      align: side,
    };
  }
  return {
    left,
    width,
    top: anchor.y + anchor.height + GAP,
    maxHeight: Math.min(MAX_HEIGHT, below - GUTTER),
    placement: 'below',
    align: side,
  };
}

/**
 * One drop-down (the owner's build 22 items 3–4: "Native drop-downs"; D1): a
 * menu anchored to the thing that opens it, in place of the cards the pickers
 * were. The trigger is measured when pressed (`measureInWindow`); the panel —
 * Liquid Glass (`GlassSurface`), with the theme's raised shadow — opens beside
 * it (`placeDropdown`), fading in and growing from the trigger's corner in
 * 180 ms (only fading under Reduce Motion). Every row is a press (it ticks), at
 * least 44 tall, with the chosen one's check; a tap outside it, or Android's
 * back, closes it — unless `locked` (a workspace switching). Choosing calls
 * `onChange` and closes it, unless the page holds `open` itself.
 *
 * testIDs: the menu `${testID}-menu`, a row `${testID}-option-${value}` or its
 * own `testID`, the check `${testID}-chosen`, the outside `${testID}-backdrop`.
 */
export function Dropdown<T extends string>({
  testID,
  options,
  value,
  onChange,
  trigger,
  title,
  align,
  open: openProp,
  onOpenChange,
  status,
  busyValue,
  busyLabel,
  locked = false,
  footer,
}: {
  testID: string;
  options: readonly DropdownOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /**
   * What opens it: drawn by the menu with its own open (a function), or — a page
   * that holds `open` — the page's own control, whose press sets it, so the press
   * is the page's and `audit:presses` follows it there.
   */
  trigger: React.ReactNode | ((t: { onPress: () => void; expanded: boolean }) => React.ReactNode);
  title?: string;
  align?: 'start' | 'end';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  status?: { text: string; tone?: 'muted' | 'error'; testID?: string } | null;
  busyValue?: T | null;
  busyLabel?: string;
  locked?: boolean;
  /** A last row in the accent (Reload session); `hidden` while it is not owed, so its press is always written where `audit:presses` reads it; `disabled` while it works. */
  footer?: { label: string; onPress: () => void; testID: string; hidden?: boolean; disabled?: boolean };
}) {
  const { palette } = useTheme();
  const screen = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const anchorRef = useRef<View>(null);
  const [ownOpen, setOwnOpen] = useState(false);
  const [anchor, setAnchor] = useState<DropdownAnchor | null>(null);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : ownOpen;

  const setOpen = (next: boolean) => {
    if (!controlled) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const measure = () => {
    anchorRef.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  };

  // A page that opens it itself (the workspace's two triggers) has it measured on opening.
  useEffect(() => {
    if (open) measure();
  }, [open]);

  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = open ? withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }) : 0;
  }, [open, shown]);
  const enter = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: reduceMotion ? [] : [{ scale: 0.92 + 0.08 * shown.value }],
  }));

  const close = () => {
    if (locked) return;
    setOpen(false);
  };

  const choose = (next: T) => {
    onChange(next);
    if (!controlled) setOwnOpen(false);
  };

  // Not measured yet (or a test's mock that never answers): under the status area, on the start side.
  const frame = placeDropdown(anchor ?? { x: GUTTER, y: 64, width: 0, height: 38 }, screen, align);
  const origin = `${frame.placement === 'below' ? 'top' : 'bottom'} ${frame.align === 'start' ? 'left' : 'right'}`;

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        {typeof trigger === 'function'
          ? trigger({
              expanded: open,
              onPress: () => {
                measure();
                setOpen(true);
              },
            })
          : trigger}
      </View>
      <Modal visible={open} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
        <Pressable
          testID={`${testID}-backdrop`}
          accessibilityLabel="Close"
          onPress={close}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          style={[
            styles.panel,
            elevation(palette).md,
            {
              left: frame.left,
              width: frame.width,
              top: frame.top,
              bottom: frame.bottom,
              transformOrigin: origin,
            },
            enter,
          ]}>
          <GlassSurface radius={RADIUS} backing="panel" testID={`${testID}-menu`} style={{ maxHeight: frame.maxHeight }}>
            <View accessibilityViewIsModal>
              <ScrollView bounces={false} style={{ maxHeight: frame.maxHeight }}>
                {title ? (
                  <Text style={[styles.title, { color: palette.neutral[500] }]} accessibilityRole="header">
                    {title.toUpperCase()}
                  </Text>
                ) : null}
                {options.map((option, index) => {
                  const chosen = option.value === value;
                  const busy = busyValue != null && option.value === busyValue;
                  const IconCmp = option.icon;
                  return (
                    <Pressable
                      key={option.value}
                      testID={option.testID ?? `${testID}-option-${option.value}`}
                      accessibilityRole="menuitem"
                      accessibilityState={{ selected: chosen, disabled: locked }}
                      disabled={locked}
                      onPress={() => choose(option.value)}
                      style={({ pressed }) => [
                        styles.row,
                        (index > 0 || title) && { borderTopWidth: 1, borderTopColor: palette.divider },
                        pressed && { backgroundColor: withAlpha(palette.text, 0.07) },
                      ]}>
                      {IconCmp ? <IconCmp size={20} color={palette.neutral[300]} /> : null}
                      <View style={styles.rowBody}>
                        {/* A long name wraps rather than being cut short, as iOS's own menus do (~~one line~~ until round 24's simulator audit). */}
                        <Text style={[styles.label, { color: palette.text }]}>
                          {option.label}
                        </Text>
                        {option.sub ? (
                          <Text style={[styles.sub, { color: palette.neutral[400] }]}>
                            {option.sub}
                          </Text>
                        ) : null}
                      </View>
                      {busy && busyLabel ? (
                        <Text style={[styles.sub, { color: palette.neutral[500] }]}>{busyLabel}</Text>
                      ) : chosen ? (
                        <Check size={16} color={palette.accent} testID={`${testID}-chosen`} />
                      ) : null}
                    </Pressable>
                  );
                })}
                {status ? (
                  <Text
                    testID={status.testID}
                    style={[
                      styles.status,
                      { color: status.tone === 'error' ? statusColor.err : palette.neutral[400] },
                      (options.length > 0 || title) && { borderTopWidth: 1, borderTopColor: palette.divider },
                    ]}>
                    {status.text}
                  </Text>
                ) : null}
                {footer && !footer.hidden ? (
                  <Pressable
                    testID={footer.testID}
                    accessibilityRole="menuitem"
                    accessibilityState={{ disabled: footer.disabled === true }}
                    disabled={footer.disabled}
                    onPress={footer.onPress}
                    style={({ pressed }) => [
                      styles.row,
                      { borderTopWidth: 1, borderTopColor: palette.divider },
                      pressed && { backgroundColor: withAlpha(palette.text, 0.07) },
                    ]}>
                    <Text style={[styles.label, { color: palette.accent }]}>{footer.label}</Text>
                  </Pressable>
                ) : null}
              </ScrollView>
            </View>
          </GlassSurface>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    borderRadius: RADIUS,
  },
  title: {
    paddingHorizontal: space.rowX,
    paddingTop: space.rowY,
    paddingBottom: space.inner,
    fontFamily: fonts.medium,
    fontSize: typeScale.micro.fontSize,
    letterSpacing: em(0.14, typeScale.micro.fontSize),
  },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inner,
    padding: space.card,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label.fontSize,
    lineHeight: typeScale.label.lineHeight,
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
    lineHeight: typeScale.small.lineHeight,
  },
  status: {
    padding: space.card,
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
    lineHeight: typeScale.small.lineHeight,
  },
});
