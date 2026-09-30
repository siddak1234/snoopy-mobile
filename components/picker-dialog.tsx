import { Check } from 'phosphor-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Choose one from a list that may be long — a person, a team — where the
 * website has a dropdown. Mounted only while open; picking closes it.
 */
export function PickerDialog({
  title,
  options,
  selected,
  empty,
  onPick,
  onClose,
}: {
  title: string;
  options: readonly { value: string; label: string; sub?: string }[];
  selected?: string;
  /** Said when there is nothing to choose. */
  empty: string;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Dialog visible testID="picker-dialog" onRequestClose={onClose} title={title} actions={<DialogButton label="Close" onPress={onClose} />}>
      {options.length === 0 ? <DialogText>{empty}</DialogText> : null}
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {options.map((option) => (
          <Pressable
            key={option.value}
            testID={`pick-${option.value}`}
            onPress={() => onPick(option.value)}
            style={({ pressed }) => [styles.row, { borderBottomColor: palette.divider }, pressed && { opacity: 0.7 }]}>
            <View style={styles.body}>
              <Text style={[styles.label, { color: palette.text }]}>{option.label}</Text>
              {option.sub ? <Text style={[styles.sub, { color: palette.neutral[400] }]}>{option.sub}</Text> : null}
            </View>
            {option.value === selected ? <Check size={16} color={palette.accent} /> : null}
          </Pressable>
        ))}
      </ScrollView>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: 360 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1 },
  body: { flex: 1, minWidth: 0 },
  label: { fontFamily: fonts.medium, fontSize: 14 },
  sub: { fontFamily: fonts.regular, fontSize: 12 },
});
