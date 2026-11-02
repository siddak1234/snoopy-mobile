import { MagnifyingGlass, X } from 'phosphor-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Pressable } from '@/components/pressable';
import { TextInput } from '@/components/text';
import { fonts, radius, space, typeScale, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { BLOCK_WORDS } from '@/lib/generated/platform-contracts/block-rules';
import { QUERY_LENGTH } from '@/lib/view/block-sort';

/** The search box: the glass, the glass's magnifier, the hint (`BLOCK_WORDS.search`, `searchItems`); × clears it (`clearSearch`). */
export function SearchBox({
  value,
  onChange,
  placeholder,
  testID,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={[styles.search, { borderColor: palette.neutral[800], backgroundColor: withAlpha(palette.surface, 0.6) }]}>
      <MagnifyingGlass size={17} color={palette.neutral[500]} />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={(next) => onChange(next.slice(0, QUERY_LENGTH))}
        placeholder={placeholder}
        placeholderTextColor={palette.neutral[500]}
        selectionColor={palette.accent}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        maxLength={QUERY_LENGTH}
        style={[styles.searchInput, { color: palette.text }]}
      />
      {value !== '' ? (
        <Pressable
          testID={`${testID}-clear`}
          accessibilityRole="button"
          accessibilityLabel={BLOCK_WORDS.clearSearch}
          hitSlop={space.inner}
          onPress={() => onChange('')}>
          <X size={15} color={palette.neutral[500]} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    minHeight: space.rowMinHeight,
    borderRadius: radius.input,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inner,
    paddingHorizontal: space.rowX,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: typeScale.label.fontSize,
    paddingVertical: 0,
  },
});
