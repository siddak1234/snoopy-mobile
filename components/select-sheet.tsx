import { Check } from 'phosphor-react-native';
import React, { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { DividedCard } from '@/components/group';
import { SectionTitle } from '@/components/nocturne/section-label';
import { OpenRow } from '@/components/open-row';
import { Page } from '@/components/page';
import { PageHeader } from '@/components/page-header';
import { Pressable } from '@/components/pressable';
import { SearchBox } from '@/components/search-box';
import { Text } from '@/components/text';
import { optionGroups } from '@/components/dropdown';
import { fonts, space, typeScale, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { NO_MATCHES, SEARCH_ALL, SELECT_CATEGORY } from '@/lib/content/screen-states';
import { BLOCK_WORDS } from '@/lib/generated/platform-contracts/block-rules';
import { search } from '@/lib/view/block-sort';

/** One choice of a grouped select: what is saved, what is shown, its group. */
export type SheetOption = { value: string; label: string; group?: string };

/**
 * A setup select whose options carry groups, as a full-height sheet (the
 * owner's build 34 F1: "The drop down is quite small … rather than one drop
 * down is it possible to do two? One for category and then the sub specialty.
 * … a typing feature"), in two steps under the field's title:
 *
 * 1. "Category" over its groups, in the order they first appear, each a row
 *    that opens its step 2; above them "Search all", which, typed in, lists
 *    every option whose label holds the words, under its group's name;
 * 2. Back and the group's name over its options, with the lists' search box
 *    ("Search") to narrow them.
 *
 * A row is the option's label and, chosen, its tick. One choice closes the
 * sheet; a field that allows several (`multiple`) toggles the row and stays.
 * Back on step 2 goes to the groups, on step 1 closes the sheet, as Android's
 * back does; closing forgets the step and both searches. The options are the
 * setup payload's: nothing is read.
 *
 * testIDs: the sheet `${testID}-sheet`, Search all `${testID}-search-all`, a
 * group `${testID}-group-${n}`, step 2's box `${testID}-search`, a row
 * `${testID}-option-${value}`, its tick `${testID}-chosen-${value}`, nothing
 * found `${testID}-no-matches`.
 */
export function SelectSheet({
  testID,
  title,
  options,
  chosen,
  multiple,
  open,
  onChoose,
  onClose,
}: {
  testID: string;
  title: string;
  options: readonly SheetOption[];
  chosen: readonly string[];
  multiple: boolean;
  open: boolean;
  /** A row pressed: the page chooses it, or — several — toggles it. */
  onChoose: (value: string) => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const [step, setStep] = useState<number | null>(null);
  const [all, setAll] = useState('');
  const [narrow, setNarrow] = useState('');
  const groups = optionGroups(options);
  const group = step === null ? null : (groups[step] ?? null);

  const close = () => {
    setStep(null);
    setAll('');
    setNarrow('');
    onClose();
  };
  const back = () => {
    if (group) {
      setStep(null);
      setNarrow('');
    } else close();
  };
  const choose = (value: string) => {
    onChoose(value);
    if (!multiple) close();
  };

  const found = group
    ? search(group.options, narrow, (option) => [option.label])
    : all.trim() === ''
      ? null
      : search(options, all, (option) => [option.label]);

  return (
    <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onRequestClose={back}>
      <Page testID={`${testID}-sheet`} keyboardShouldPersistTaps="handled">
        <PageHeader onBack={back} title={group ? group.name : title} />
        {group ? (
          <SearchBox testID={`${testID}-search`} value={narrow} onChange={setNarrow} placeholder={BLOCK_WORDS.search} />
        ) : (
          <SearchBox testID={`${testID}-search-all`} value={all} onChange={setAll} placeholder={SEARCH_ALL} />
        )}
        {found !== null && found.length === 0 ? (
          <Text testID={`${testID}-no-matches`} style={[styles.none, { color: palette.neutral[400] }]}>
            {NO_MATCHES}
          </Text>
        ) : null}
        {group && found ? (
          <OptionCard testID={testID} options={found} chosen={chosen} onChoose={choose} />
        ) : found ? (
          optionGroups(found).map((match) => (
            <View key={match.name}>
              {match.name ? <SectionTitle>{match.name.toUpperCase()}</SectionTitle> : null}
              <OptionCard testID={testID} options={match.options} chosen={chosen} onChoose={choose} />
            </View>
          ))
        ) : (
          <View>
            <SectionTitle>{SELECT_CATEGORY.toUpperCase()}</SectionTitle>
            <DividedCard>
              {groups.map((entry, at) => (
                <OpenRow
                  key={entry.name}
                  testID={`${testID}-group-${at}`}
                  title={entry.name}
                  onPress={() => {
                    setStep(at);
                    setNarrow('');
                  }}
                />
              ))}
            </DividedCard>
          </View>
        )}
      </Page>
    </Modal>
  );
}

/** One card of options, a divider between each: the label, and the tick on a chosen one. */
function OptionCard({
  testID,
  options,
  chosen,
  onChoose,
}: {
  testID: string;
  options: readonly SheetOption[];
  chosen: readonly string[];
  onChoose: (value: string) => void;
}) {
  const { palette } = useTheme();
  return (
    <DividedCard>
      {options.map((option) => {
        const picked = chosen.includes(option.value);
        return (
          <Pressable
            key={option.value}
            testID={`${testID}-option-${option.value}`}
            accessibilityRole="menuitem"
            accessibilityState={{ selected: picked }}
            onPress={() => onChoose(option.value)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: withAlpha(palette.text, 0.07) }]}>
            <Text style={[styles.label, { color: palette.text }]}>{option.label}</Text>
            {picked ? <Check size={16} color={palette.accent} testID={`${testID}-chosen-${option.value}`} /> : null}
          </Pressable>
        );
      })}
    </DividedCard>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: space.rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inner,
    paddingVertical: space.rowY,
    paddingHorizontal: space.rowX,
  },
  label: { flex: 1, minWidth: 0, fontFamily: fonts.medium, ...typeScale.label },
  none: { fontFamily: fonts.regular, ...typeScale.body },
});
