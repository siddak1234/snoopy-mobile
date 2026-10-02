import { CaretDown, CaretUp, Check } from 'phosphor-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, radius, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A dropdown inside a dialog (BUILD-PLAN 24.11.7: the owner asked for the team
 * kind as a dropdown). It opens in place, under the field, rather than as a
 * second modal: a modal presented over a dialog that is itself a modal is not
 * shown reliably on iOS. Laid out as `TextField` is — label over a 50px box —
 * so the two read as one form.
 */
export function SelectField({
  label,
  options,
  selected,
  placeholder,
  onSelect,
  testID,
}: {
  label: string;
  options: readonly { value: string; label: string; sub?: string }[];
  selected: string | null;
  placeholder: string;
  onSelect: (value: string) => void;
  testID: string;
}) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === selected);
  const Caret = open ? CaretUp : CaretDown;
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: palette.neutral[400] }]}>{label}</Text>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={[
          styles.box,
          { borderColor: open ? palette.accent : palette.neutral[700], backgroundColor: withAlpha(palette.surface, 0.72) },
        ]}>
        <Text numberOfLines={1} style={[styles.value, { color: current ? palette.text : palette.neutral[500] }]}>
          {current?.label ?? placeholder}
        </Text>
        <Caret size={14} color={palette.neutral[500]} />
      </Pressable>
      {open ? (
        <View style={[styles.list, { borderColor: palette.neutral[800] }]}>
          {options.map((option, index) => (
            <Pressable
              key={option.value}
              testID={`${testID}-option-${option.value}`}
              accessibilityRole="button"
              onPress={() => {
                onSelect(option.value);
                setOpen(false);
              }}
              style={({ pressed }) => [
                styles.option,
                index < options.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.divider },
                pressed && { backgroundColor: withAlpha(palette.text, 0.04) },
              ]}>
              <View style={styles.optionBody}>
                <Text style={[styles.optionLabel, { color: palette.text }]}>{option.label}</Text>
                {option.sub ? <Text style={[styles.optionSub, { color: palette.neutral[400] }]}>{option.sub}</Text> : null}
              </View>
              {option.value === selected ? <Check size={15} color={palette.accent} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontFamily: fonts.regular, fontSize: 12.5 },
  box: {
    height: 50,
    borderRadius: radius.input,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  value: { flex: 1, fontFamily: fonts.regular, fontSize: 15 },
  list: { borderWidth: 1, borderRadius: radius.input, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  optionBody: { flex: 1, minWidth: 0 },
  optionLabel: { fontFamily: fonts.medium, fontSize: 14 },
  optionSub: { fontFamily: fonts.regular, fontSize: 12 },
});
