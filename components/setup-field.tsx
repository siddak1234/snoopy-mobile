import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { HandPalm, Sliders, Tray } from 'phosphor-react-native';

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

/** Mirrors the catalog service's required-config predicate exactly. */
export function missingRequiredSetupFields(
  fields: SetupField[],
  values: Record<string, unknown>,
): SetupField[] {
  return fields.filter((field) => {
    if (!field.required || field.defaultValue !== undefined) return false;
    const value = values[field.key];
    return value === undefined || value === null || value === '';
  });
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
  const externalValue =
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const [draft, setDraft] = useState(externalValue);
  const lastEmitted = useRef<unknown>(value);

  // Preserve intermediate numeric input such as `12.` while still accepting a
  // new server value when the subscription is reloaded after connecting.
  useEffect(() => {
    if (Object.is(value, lastEmitted.current)) return;
    lastEmitted.current = value;
    setDraft(externalValue);
  }, [externalValue, value]);

  const changeText = (next: string) => {
    setDraft(next);
    if (field.control === 'money') {
      const normalized = next.trim();
      const numeric = normalized === '' ? undefined : Number(normalized);
      if (numeric === undefined || Number.isFinite(numeric)) {
        lastEmitted.current = numeric;
        onChange(numeric);
      }
      return;
    }
    lastEmitted.current = next;
    onChange(next);
  };

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
        <View
          style={[
            styles.inputWrap,
            { borderColor: palette.neutral[700], backgroundColor: palette.bg },
          ]}>
          {field.control === 'money' ? (
            <Text style={[styles.currency, { color: palette.neutral[400] }]}>$</Text>
          ) : null}
          <TextInput
            accessibilityLabel={field.title}
            value={draft}
            onChangeText={changeText}
            placeholder={field.required ? 'Required' : 'Optional'}
            placeholderTextColor={palette.neutral[500]}
            keyboardType={field.control === 'money' ? 'decimal-pad' : 'default'}
            autoCapitalize="none"
            autoCorrect={false}
            selectionColor={palette.accent}
            style={[styles.input, { color: palette.text }]}
          />
        </View>
      )}
    </>
  );

  const rowStyle = [
    styles.row,
    divider && { borderBottomWidth: 1, borderBottomColor: palette.divider },
  ];

  // The public contract has no resource-list operation or resource kind. Match
  // the completed web client: accept its opaque string value in a text input
  // instead of inventing a provider-specific picker.
  return <View style={rowStyle}>{body}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontFamily: fonts.medium, fontSize: 14 },
  rowSub: { fontFamily: fonts.regular, fontSize: 12 },
  inputWrap: {
    width: 112,
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  currency: { fontFamily: fonts.regular, fontSize: 13 },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 7,
    paddingHorizontal: 2,
    fontFamily: fonts.regular,
    fontSize: 12.5,
  },
});
