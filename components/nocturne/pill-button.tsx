import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import type { Icon } from 'phosphor-react-native';

import { Pressable } from '@/components/pressable';
import { Text } from '@/components/text';
import { fontScaleLimit, fonts, inset, space, typeScale, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type PillButtonVariant =
  /** Accent outline + accent label — the Nocturne primary (never a fill). */
  | 'primary'
  /** Neutral-700 outline + text-color label. */
  | 'secondary'
  /** No outline, text-color label (e.g. the Face ID question → "Not now"). */
  | 'plain'
  /** No outline, accent-300 label (e.g. "Unlock with Face ID"). */
  | 'accent-ghost'
  /**
   * Danger outline + danger label and icon, a 10% danger tint when pressed — the
   * design's red pill ("Remove", Screen.dc.html:450): an action that removes or
   * ends something (the owner's build 12 item 5). `palette.danger` per theme.
   */
  | 'danger';

type Props = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: PillButtonVariant;
  fontSize?: number;
  icon?: Icon;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** What a screen reader says, where it differs from the label ("Previous page"). */
  accessibilityLabel?: string;
  /**
   * The chosen one of a pair, said to a screen reader (`accessibilityState.selected`;
   * a review's Accept or Deny, Round 21's F2). Undefined, nothing is said.
   */
  selected?: boolean;
};

/**
 * Every pill's height (Round 21, plan Open 11): Apple's 44-pt tap target, the
 * table's least row height. ~~`height` 36 to 68, the default 52, and the icon's
 * `gap` 5 to 9~~ until Round 21.
 */
export const PILL_HEIGHT = space.rowMinHeight;

export function PillButton({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  fontSize,
  icon: IconCmp,
  iconSize,
  style,
  testID,
  accessibilityLabel,
  selected,
}: Props) {
  const { palette } = useTheme();
  const size = fontSize ?? typeScale.label.fontSize;

  const borderColor =
    variant === 'primary' ? palette.accent :
    variant === 'secondary' ? palette.neutral[700] :
    variant === 'danger' ? palette.danger : 'transparent';
  const color =
    variant === 'primary' ? palette.accent :
    variant === 'accent-ghost' ? palette.accentRamp[300] :
    variant === 'danger' ? palette.danger : palette.text;
  const pressedBg =
    variant === 'primary' ? withAlpha(palette.accent, 0.12) :
    variant === 'accent-ghost' ? withAlpha(palette.accent, 0.08) :
    variant === 'danger' ? withAlpha(palette.danger, 0.1) :
    withAlpha(palette.text, 0.07);

  return (
    <Pressable
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled || undefined}
      accessibilityState={
        disabled || selected !== undefined
          ? { ...(disabled ? { disabled: true } : {}), ...(selected !== undefined ? { selected } : {}) }
          : undefined
      }
      style={({ pressed }) => [
        {
          // The least height: a label at a large text size grows it (round 24 P3).
          minHeight: PILL_HEIGHT,
          borderRadius: 999,
          borderWidth: variant === 'primary' || variant === 'secondary' || variant === 'danger' ? 1 : 0,
          borderColor,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: inset.sm,
          paddingHorizontal: space.rowX,
          backgroundColor: pressed && !disabled ? pressedBg : 'transparent',
          ...(disabled ? { opacity: 0.5 } : {}),
        },
        style,
      ]}>
      {IconCmp ? <IconCmp size={iconSize ?? size + 1} color={color} weight="regular" /> : null}
      <Text maxFontSizeMultiplier={fontScaleLimit.chrome} style={{ fontFamily: fonts.medium, fontSize: size, color }}>
        {label}
      </Text>
    </Pressable>
  );
}
