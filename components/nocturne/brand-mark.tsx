import React from 'react';
import { Image, type StyleProp, type ImageStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** a8x-mark.png is 1800×879. */
const ASPECT = 1800 / 879;

type Props = {
  /** Rendered width (design uses width for hero placements…). */
  width?: number;
  /** …or height for inline placements (e.g. 17px in the Home header). */
  height?: number;
  opacity?: number;
  style?: StyleProp<ImageStyle>;
};

/** The A8X wordmark. The PNG is monochrome light-grey; on light theme the
 *  design inverts it (invert(.87) ≈ #383838), which tintColor reproduces. */
export function BrandMark({ width, height, opacity = 1, style }: Props) {
  const { palette } = useTheme();
  const w = width ?? (height ? height * ASPECT : 118);
  const h = height ?? w / ASPECT;
  return (
    <Image
      source={require('@/assets/images/a8x-mark.png')}
      style={[{ width: w, height: h, opacity, tintColor: palette.brandTint }, style]}
      resizeMode="contain"
    />
  );
}
