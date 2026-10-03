import { CaretDown, CaretUp, Check } from 'phosphor-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fonts, radius, typeScale, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** About five and a half rows: the list says it scrolls rather than running off the screen. */
const LIST_MAX_HEIGHT = 224;

/**
 * A dropdown inside a dialog (BUILD-PLAN 24.11.7: the owner asked for the team
 * kind as a dropdown). It opens in place rather than as a second modal: a modal
 * presented over a dialog that is itself a modal is not shown reliably on iOS.
 * Laid out as `TextField` is — label over a 50px box — so the two read as one
 * form.
 *
 * Open, the list floats over what is below it, in front of the card (24.12, the
 * owner's build 9: "it should bring the drop down to the front", not grow the
 * card): absolutely placed under the box, opaque, raised, and stacked above the
 * fields after it. The raised list does not clip — Android draws an elevated
 * view that also clips as an empty box — so its rows scroll in an inner
 * ScrollView, which clips them.
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
  const { palette, elevation } = useTheme();
  const [open, setOpen] = useState(false);
  // Where the box ends, so the list starts just under it.
  const [boxBottom, setBoxBottom] = useState(0);
  const current = options.find((option) => option.value === selected);
  const Caret = open ? CaretUp : CaretDown;
  return (
    <View style={[styles.wrap, open && styles.raised]}>
      <Text style={[styles.label, { color: palette.neutral[400] }]}>{label}</Text>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        onLayout={(event) => setBoxBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}
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
        <View
          testID={`${testID}-list`}
          style={[
            styles.list,
            elevation.md,
            { top: boxBottom + 4, backgroundColor: palette.surface, borderColor: palette.neutral[700] },
          ]}>
          <ScrollView style={styles.scroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
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
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  // Above the siblings that follow it — the Other field, the error line.
  raised: { zIndex: 20 },
  label: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
  box: {
    height: 50,
    borderRadius: radius.input,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  value: { flex: 1, fontFamily: fonts.regular, fontSize: typeScale.lead.fontSize },
  list: { position: 'absolute', left: 0, right: 0, zIndex: 20, borderWidth: 1, borderRadius: radius.input },
  scroll: { maxHeight: LIST_MAX_HEIGHT, borderRadius: radius.input },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  optionBody: { flex: 1, minWidth: 0 },
  optionLabel: { fontFamily: fonts.medium, fontSize: typeScale.label.fontSize },
  optionSub: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
});
