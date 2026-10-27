import React from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';

import { Text } from '@/components/text';
import { em, fonts, space, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  children: string;
  fontSize?: number;
  /** Letter-spacing in em (design: .14em sections, .16em card kickers,
   *  .26–.36em brand kickers). */
  track?: number;
  /** Defaults to neutral-400; pass accentRamp[300] for accent kickers. */
  color?: string;
  style?: StyleProp<TextStyle>;
};

/** Tracked uppercase kicker/section label. */
export function SectionLabel({ children, fontSize = typeScale.caption.fontSize, track = 0.14, color, style }: Props) {
  const { palette } = useTheme();
  return (
    <Text
      style={[
        {
          fontFamily: fonts.regular,
          fontSize,
          letterSpacing: em(track, fontSize),
          color: color ?? palette.neutral[400],
        },
        style,
      ]}>
      {children}
    </Text>
  );
}

/**
 * A title over what it heads (Round 21; the owner's build 30 note F3 and Q8):
 * the tracked capitals of `SectionLabel`, a header for a screen reader, `title`
 * (8) above its content, and a line height of one em, so the label's descent
 * adds no room of its own under it (the 3 pt Inter kept below the baseline,
 * measured on fb03). A form's title ("ADD CANDIDATE") and a label before a list
 * ("CANDIDATES") are both this, so both sit the same distance above their
 * cards. ~~`SectionLabel` then `marginTop: 9` on the card, typed 23 times~~
 * until Round 21.
 */
export function SectionTitle({
  children,
  color,
  testID,
  flush = false,
}: {
  children: string;
  color?: string;
  testID?: string;
  /** No gap of its own: the title shares a line that carries the gap (`Group`'s title with a button). */
  flush?: boolean;
}) {
  const fontSize = typeScale.caption.fontSize;
  return (
    <View testID={testID} accessible accessibilityRole="header" style={flush ? undefined : titleStyles.wrap}>
      <SectionLabel color={color} style={{ lineHeight: fontSize, textTransform: 'uppercase' }}>
        {children}
      </SectionLabel>
    </View>
  );
}

const titleStyles = StyleSheet.create({ wrap: { marginBottom: space.title } });
