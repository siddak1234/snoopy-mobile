import React from 'react';
import { Pressable, Text } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { fonts, radius, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type OAuthProvider = 'apple' | 'google' | 'microsoft';

/** Brand glyphs exactly as inlined in the design (fill: currentColor). */
function ProviderGlyph({ provider, color }: { provider: OAuthProvider; color: string }) {
  if (provider === 'apple') {
    return (
      <Svg width={17} height={17} viewBox="0 0 384 512" style={{ marginTop: -2 }}>
        <Path
          fill={color}
          d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.7-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
        />
      </Svg>
    );
  }
  if (provider === 'google') {
    return (
      <Svg width={17} height={17} viewBox="0 0 24 24">
        <Path
          fill={color}
          d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"
        />
      </Svg>
    );
  }
  return (
    <Svg width={16} height={16} viewBox="0 0 21 21">
      <Rect x={0} y={0} width={10} height={10} fill={color} />
      <Rect x={11} y={0} width={10} height={10} fill={color} />
      <Rect x={0} y={11} width={10} height={10} fill={color} />
      <Rect x={11} y={11} width={10} height={10} fill={color} />
    </Svg>
  );
}

type Props = {
  provider: OAuthProvider;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
};

/** 48px OAuth row button: radius 12, neutral-700 ring, 14.5px medium label. */
export function OAuthButton({ provider, label, onPress, disabled = false }: Props) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || undefined}
      accessibilityState={disabled ? { disabled: true } : undefined}
      style={({ pressed }) => ({
        height: 48,
        borderRadius: radius.input,
        borderWidth: 1,
        borderColor: palette.neutral[700],
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        backgroundColor: pressed && !disabled ? withAlpha(palette.text, 0.06) : 'transparent',
        ...(disabled ? { opacity: 0.5 } : {}),
      })}>
      <ProviderGlyph provider={provider} color={palette.text} />
      <Text style={{ fontFamily: fonts.medium, fontSize: 14.5, color: palette.text }}>{label}</Text>
    </Pressable>
  );
}
