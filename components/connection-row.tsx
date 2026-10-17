import { Prohibit } from 'phosphor-react-native';
import React from 'react';
import { Image, StyleSheet, Text, View, type AccessibilityRole, type AccessibilityState } from 'react-native';

import { ProviderGlyph } from '@/components/nocturne/oauth-button';
import { Pressable } from '@/components/pressable';
import { fonts, iconSize, status, typeScale, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DISCONNECT_LABEL } from '@/lib/content/screen-states';
import { brandMarkFor } from '@/lib/view/brand-logos';
import { iconFor } from '@/lib/view/icon-registry';

/** The row's least height (spec A4): the same for every provider, whatever its line says. */
export const CONNECTION_ROW_MIN_HEIGHT = 64;

/**
 * A vendor's mark at the row's 24 × 24 (Build 21, spec A4; the session's S12):
 * QuickBooks' round symbol, the design's Google glyph, or the icon set's glyph
 * for any other name — never a wordmark, so every row lines up.
 */
export function ConnectionMark({ icon, testID }: { icon: string | null | undefined; testID?: string }) {
  const { palette } = useTheme();
  const mark = brandMarkFor(icon);
  if (mark?.kind === 'image') {
    return (
      <Image
        testID={testID}
        accessibilityRole="image"
        accessibilityLabel={mark.alt}
        source={mark.source}
        resizeMode="contain"
        style={styles.mark}
      />
    );
  }
  if (mark?.kind === 'glyph') {
    return (
      <View testID={testID} accessibilityRole="image" accessibilityLabel={mark.alt} style={styles.markBox}>
        <ProviderGlyph provider={mark.provider} color={palette.text} size={iconSize.row} />
      </View>
    );
  }
  const Glyph = iconFor(icon);
  return (
    <View testID={testID} style={styles.markBox}>
      <Glyph size={iconSize.row} color={palette.accentRamp[300]} />
    </View>
  );
}

/** "None" (no vendor): its mark, the Prohibit glyph at 24. */
export function NoneMark({ testID }: { testID?: string }) {
  const { palette } = useTheme();
  return (
    <View testID={testID} style={styles.markBox}>
      <Prohibit size={iconSize.row} color={palette.accentRamp[300]} />
    </View>
  );
}

export type ConnectionLineTone = 'muted' | 'ok' | 'warn' | 'err';

/**
 * The one connection row (Build 21, spec A4; the owner's build 20 items 6 and
 * 7: "Logo then to the right name then below the account email", "Standard
 * format and size for each connection component on the list not random buttons
 * and such"): the mark, 24 × 24 · the name · under it one short line — the
 * account's email, or its state — and on the right one thing: our own button
 * (`ConnectionButton`), a check, a caret, or nothing. At least 64 tall for
 * every provider. Composed of the theme's tokens; a content component, not a
 * Nocturne primitive, snapshot-pinned in both palettes
 * (`__tests__/connection-row.test.tsx`).
 *
 * Used on Settings › Connections, on a flow page's CONNECTIONS and its vendor
 * row, and on Connect vendor, where the whole row is the control (`onPress`).
 */
export function ConnectionRow({
  mark,
  name,
  line,
  lineTone = 'muted',
  right,
  onPress,
  disabled,
  divider = false,
  testID,
  accessibilityRole,
  accessibilityState,
  accessibilityLabel,
}: {
  mark: React.ReactNode;
  name: string;
  line?: string | null;
  lineTone?: ConnectionLineTone;
  right?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  divider?: boolean;
  testID?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  accessibilityLabel?: string;
}) {
  const { palette } = useTheme();
  const lineColor =
    lineTone === 'ok'
      ? status.ok
      : lineTone === 'warn'
        ? status.warnText
        : lineTone === 'err'
          ? status.err
          : palette.neutral[400];
  const body = (
    <>
      {mark}
      <View style={styles.body}>
        <Text style={[styles.name, { color: palette.text }]}>{name}</Text>
        {line ? <Text style={[styles.line, { color: lineColor }]}>{line}</Text> : null}
      </View>
      {right ?? null}
    </>
  );
  const rowStyle = [styles.row, divider && { borderBottomWidth: 1, borderBottomColor: palette.divider }];
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole={accessibilityRole ?? 'button'}
        accessibilityState={accessibilityState ?? (disabled ? { disabled: true } : undefined)}
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [rowStyle, pressed && !disabled && { backgroundColor: withAlpha(palette.text, 0.04) }]}>
        {body}
      </Pressable>
    );
  }
  // A row that is no control here — a vendor a member cannot connect — still says what it is, and that it waits.
  return (
    <View
      testID={testID}
      style={rowStyle}
      accessible={accessibilityRole !== undefined || undefined}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}>
      {body}
    </View>
  );
}

/**
 * The row's one button, ours (spec A4; the owner's ~04:15Z: no vendor's button
 * image): Connect or Reconnect in the accent, Disconnect in red — it ends
 * something, behind a question (the owner's build 12 item 5).
 */
export function ConnectionButton({
  label,
  onPress,
  disabled,
  testID,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { palette } = useTheme();
  const tone = label === DISCONNECT_LABEL ? palette.danger : palette.accent;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={disabled ? { disabled: true } : undefined}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { borderColor: disabled ? palette.neutral[700] : tone },
        pressed && !disabled && { backgroundColor: withAlpha(tone, 0.12) },
      ]}>
      <Text style={[styles.buttonLabel, { color: disabled ? palette.neutral[500] : tone }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: CONNECTION_ROW_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  mark: { width: iconSize.row, height: iconSize.row },
  markBox: { width: iconSize.row, height: iconSize.row, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.medium, ...typeScale.body },
  line: { marginTop: 1, fontFamily: fonts.regular, ...typeScale.small },
  button: { borderWidth: 1, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  buttonLabel: { fontFamily: fonts.medium, fontSize: typeScale.body.fontSize },
});
