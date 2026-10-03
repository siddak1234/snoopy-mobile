import React from 'react';
import { Text, type StyleProp, type ViewStyle } from 'react-native';
import type { Icon } from 'phosphor-react-native';

import { Pressable } from '@/components/pressable';
import { fonts, typeScale, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type PillButtonVariant =
  /** Accent outline + accent label — the Nocturne primary (never a fill). */
  | 'primary'
  /** Neutral-700 outline + text-color label. */
  | 'secondary'
  /** No outline, text-color label (e.g. the Face ID question → "Not now"). */
  | 'plain'
  /** No outline, accent-300 label (e.g. "Unlock with Face ID"). */
  | 'accent-ghost';

type Props = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: PillButtonVariant;
  height?: number;
  fontSize?: number;
  icon?: Icon;
  iconSize?: number;
  /** Row gap between icon and label (design: 5–9 depending on size). */
  gap?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function PillButton({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  height = 52,
  fontSize,
  icon: IconCmp,
  iconSize,
  gap = 7,
  style,
  testID,
}: Props) {
  const { palette } = useTheme();
  const size =
    fontSize ??
    (height >= 52 ? typeScale.lead.fontSize : height >= 44 ? typeScale.label.fontSize : typeScale.body.fontSize);

  const borderColor =
    variant === 'primary' ? palette.accent :
    variant === 'secondary' ? palette.neutral[700] : 'transparent';
  const color =
    variant === 'primary' ? palette.accent :
    variant === 'accent-ghost' ? palette.accentRamp[300] : palette.text;
  const pressedBg =
    variant === 'primary' ? withAlpha(palette.accent, 0.12) :
    variant === 'accent-ghost' ? withAlpha(palette.accent, 0.08) :
    withAlpha(palette.text, 0.07);

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || undefined}
      accessibilityState={disabled ? { disabled: true } : undefined}
      style={({ pressed }) => [
        {
          height,
          borderRadius: 999,
          borderWidth: variant === 'primary' || variant === 'secondary' ? 1 : 0,
          borderColor,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap,
          paddingHorizontal: 18,
          backgroundColor: pressed && !disabled ? pressedBg : 'transparent',
          ...(disabled ? { opacity: 0.5 } : {}),
        },
        style,
      ]}>
      {IconCmp ? <IconCmp size={iconSize ?? size + 1} color={color} weight="regular" /> : null}
      <Text style={{ fontFamily: fonts.medium, fontSize: size, color }}>{label}</Text>
    </Pressable>
  );
}
