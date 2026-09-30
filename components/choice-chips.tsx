import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FilterChip } from '@/components/nocturne/filter-chip';
import { fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * One of a few named choices — a role, a join policy — drawn as the Nocturne
 * filter chips, since a phone has no `<select>`. The website offers the same
 * values in a dropdown.
 */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: palette.neutral[400] }]}>{label}</Text> : null}
      <View style={styles.row}>
        {options.map((option) => (
          <FilterChip
            key={option.value}
            label={option.label}
            active={option.value === value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontFamily: fonts.regular, fontSize: 12.5 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
