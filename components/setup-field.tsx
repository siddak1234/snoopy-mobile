import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CaretRight, HandPalm, Sliders, Tray } from 'phosphor-react-native';

import { NocToggle } from '@/components/nocturne/noc-toggle';
import { fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { components } from '@/lib/generated/platform-contracts/automations';

export type SetupField = components['schemas']['AutomationSetupField'];

/**
 * One configuration row, generated from `manifest.setup[]`.
 *
 * This is the whole configuration surface for **every** automation that will
 * ever ship, and that is by design rather than by ambition. BUILD-PLAN §2.3 says
 * an automation using existing capabilities and providers must cost "one repo,
 * one deploy — zero platform change", and §2.2 closes `setup.control` at four
 * values with the reason "Each is a widget both clients must render" and
 * `setup.section` at four with "The mobile design has exactly four sections; UI
 * is frozen". So these four rows are not a convenience — they are the contract's
 * own justification for being closed, and a screen with hardcoded rows breaks the
 * promise that adding an automation is a data change.
 *
 * The web implemented the same thing in Snoopy PR #4 (BUILD-PLAN 4.5.3): "Rows
 * are generated from that array, not hard-coded."
 */

/** Section → the design's numbered heading, in the design's own order. */
export const SECTION_ORDER = ['connections', 'source', 'rules', 'notifications'] as const;
export type SetupSection = (typeof SECTION_ORDER)[number];

export const SECTION_LABEL: Record<SetupSection, string> = {
  connections: '1 · CONNECTIONS',
  source: '2 · SOURCE',
  rules: '3 · REVIEW RULES',
  notifications: '4 · NOTIFICATIONS',
};

/**
 * Control → glyph.
 *
 * `AutomationSetupField` publishes no icon — unlike `AutomationCatalogEntry`,
 * which requires one — so the glyph is keyed by what the row *does*. Four
 * controls is few enough that this reads rather than being a lookup table
 * standing in for missing data.
 */
const CONTROL_ICON = {
  toggle: HandPalm,
  money: Sliders,
  text: Tray,
  'resource-picker': Tray,
} as const;

/** Group fields by section, preserving manifest order within each. */
export function bySection(fields: SetupField[]): { section: SetupSection; fields: SetupField[] }[] {
  return SECTION_ORDER.map((section) => ({
    section,
    fields: fields.filter((f) => f.section === section),
  })).filter((group) => group.fields.length > 0);
}

export function SetupFieldRow({
  field,
  value,
  onChange,
  divider,
}: {
  field: SetupField;
  value: unknown;
  onChange: (next: unknown) => void;
  divider: boolean;
}) {
  const { palette } = useTheme();
  const Glyph = CONTROL_ICON[field.control];

  const body = (
    <>
      <Glyph size={20} color={palette.accentRamp[300]} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: palette.text }]}>{field.title}</Text>
        <Text style={[styles.rowSub, { color: palette.neutral[400] }]}>{field.description}</Text>
      </View>
      {field.control === 'toggle' ? (
        <NocToggle value={value === true} onChange={(next) => onChange(next)} />
      ) : (
        <View style={styles.valueSide}>
          {typeof value === 'string' || typeof value === 'number' ? (
            <Text style={[styles.rowValue, { color: palette.neutral[300] }]}>
              {field.control === 'money' ? `$${value}` : String(value)}
            </Text>
          ) : null}
          <CaretRight size={15} color={palette.neutral[500]} />
        </View>
      )}
    </>
  );

  const rowStyle = [
    styles.row,
    divider && { borderBottomWidth: 1, borderBottomColor: palette.divider },
  ];

  // A toggle is operated in place; the other three open something, so they are
  // pressable rows. `resource-picker` has nowhere to go yet — nothing in the
  // field says what it enumerates, which is filed in DESIGN-CONTRACT.md.
  if (field.control === 'toggle') return <View style={rowStyle}>{body}</View>;
  return (
    <Pressable style={({ pressed }) => [rowStyle, pressed && { opacity: 0.7 }]}>{body}</Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fonts.medium, fontSize: 14 },
  rowSub: { fontFamily: fonts.regular, fontSize: 12 },
  valueSide: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowValue: { fontFamily: fonts.regular, fontSize: 12.5 },
});
