import React, { useState } from 'react';
import { Pressable, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Eye, EyeSlash } from 'phosphor-react-native';

import { fonts, radius, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  autoComplete?: React.ComponentProps<typeof TextInput>['autoComplete'];
  keyboardType?: React.ComponentProps<typeof TextInput>['keyboardType'];
  style?: StyleProp<ViewStyle>;
};

/** Labelled auth field: 12.5px neutral-400 label over a 50px, radius-12 box
 *  (neutral-700 ring, surface at 72%). */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secure = false,
  autoComplete,
  keyboardType,
  style,
}: Props) {
  const { palette } = useTheme();
  const [hidden, setHidden] = useState(secure);
  const EyeIcon = hidden ? Eye : EyeSlash;
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, color: palette.neutral[400] }}>
        {label}
      </Text>
      <View
        style={{
          height: 50,
          borderRadius: radius.input,
          borderWidth: 1,
          borderColor: palette.neutral[700],
          backgroundColor: withAlpha(palette.surface, 0.72),
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
        }}>
        <TextInput
          // The visible label is a sibling `Text`, so the input has no
          // accessible name of its own. Naming it here is what lets a screen
          // reader announce the field, and costs nothing visually.
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.neutral[500]}
          secureTextEntry={hidden}
          autoComplete={autoComplete}
          keyboardType={keyboardType}
          autoCapitalize="none"
          selectionColor={palette.accent}
          style={{
            flex: 1,
            fontFamily: fonts.regular,
            fontSize: 15,
            color: palette.text,
            paddingVertical: 0,
          }}
        />
        {secure ? (
          <Pressable
            onPress={() => setHidden((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
            <EyeIcon size={18} color={palette.neutral[500]} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
