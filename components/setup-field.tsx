import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { HandPalm, Sliders, Tray } from 'phosphor-react-native';

import { NocToggle } from '@/components/nocturne/noc-toggle';
import { fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { components } from '@/lib/generated/platform-contracts/automations';

export type SetupField = components['schemas']['AutomationSetupField'];

/**
 * What a row draws of a manifest field. A setup field is one; so is a manual
 * run's input other than a file (ADR-0030), which shares the `text`, `money`
 * and `toggle` vocabulary — so the Run form draws the same rows (24.4.1).
 */
export type FieldRowSpec = Pick<SetupField, 'key' | 'title' | 'description' | 'required' | 'control'>;

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

/**
 * The values a manifest-driven form holds, in the type each control promises —
 * the one conversion the Set up form and the Run form both need (the website's
 * `declaredValues`). A toggle is always sent; an empty text or money field, and
 * a file not yet uploaded, are left out, so the platform applies the manifest's
 * default or refuses a required one. The platform stays the validator.
 */
export function declaredValues(
  fields: readonly { key: string; control: string }[],
  values: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const declared: Record<string, string | number | boolean> = {};
  for (const field of fields) {
    const value = values[field.key];
    if (field.control === 'toggle') declared[field.key] = value === true;
    else if (field.control === 'money') {
      if (typeof value === 'number' && Number.isFinite(value)) declared[field.key] = value;
    } else if (typeof value === 'string' && value.trim() !== '') declared[field.key] = value;
  }
  return declared;
}

/**
 * An address field gets the email keyboard. The manifest vocabulary gains an
 * `email` control (backend, 2026-10-02); until a registered version declares
 * it, a `text` field whose key or title says "email" is read as one — a keyboard
 * choice only, never a validation (24.7.3 attempt 2, feedback #2).
 */
export function isEmailField(field: Pick<FieldRowSpec, 'key' | 'title' | 'control'>): boolean {
  return (field.control as string) === 'email' || /email/iu.test(`${field.key} ${field.title}`);
}

export function SetupFieldRow({
  field,
  value,
  onChange,
  divider,
}: {
  field: FieldRowSpec;
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
      // The decimal pad types the locale's separator: "12,50" on a comma-decimal
      // device is 12.5, not 12 with the rest dropped.
      const normalized = next.trim().replace(',', '.');
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
            keyboardType={
              field.control === 'money' ? 'decimal-pad' : isEmailField(field) ? 'email-address' : 'default'
            }
            textContentType={isEmailField(field) ? 'emailAddress' : undefined}
            autoComplete={isEmailField(field) ? 'email' : undefined}
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
