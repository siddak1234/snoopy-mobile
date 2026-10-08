import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { EnvelopeSimple, HandPalm, Sliders, Tray, type Icon } from 'phosphor-react-native';

import { NocToggle } from '@/components/nocturne/noc-toggle';
import { fonts, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { NEWER_CONTROL_NOTE } from '@/lib/content/screen-states';
import type { components } from '@/lib/generated/platform-contracts/automations';

export type SetupField = components['schemas']['AutomationSetupField'];

/**
 * What a row draws of a manifest field. A setup field is one; so is a manual
 * run's input other than a file (ADR-0030), which shares the `text`, `money`
 * and `toggle` vocabulary — so the Run form draws the same rows (24.4.1). A
 * run's input has no `notifies`: only a setting switches a notification.
 *
 * `control` is a string here, not the generated union: a platform newer than
 * this build may publish a control the union does not name, and the row draws
 * it as the website does — a text input, with a note (BUILD-PLAN 25.8.1, the
 * owner's requirement 1) — instead of looking it up and crashing the dialog.
 */
export type FieldRowSpec = Pick<SetupField, 'key' | 'title' | 'description' | 'required' | 'notifies'> & {
  control: string;
};

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
 * Since 25.8.1 (Round 17, the owner's requirement 1 of 2026-10-08) the promise
 * holds for a control the union does not name yet: the row falls back to the
 * website's text input with a note, so a newer platform's manifest never
 * crashes a dialog, and no app build is needed per automation.
 *
 * The web implemented the same thing in Snoopy PR #4 (BUILD-PLAN 4.5.3): "Rows
 * are generated from that array, not hard-coded."
 */

/** The four sections the contract closes `setup.section` at. */
export const SECTION_ORDER = ['connections', 'source', 'rules', 'notifications'] as const;
export type SetupSection = (typeof SECTION_ORDER)[number];

export const SECTION_NAME: Record<SetupSection, string> = {
  connections: 'CONNECTIONS',
  source: 'SOURCE',
  rules: 'REVIEW RULES',
  notifications: 'NOTIFICATIONS',
};

/**
 * A section's heading, numbered by its place on the screen — 1 … N over the
 * sections an automation actually has. The design's fixed numbers left an
 * automation with rules and notifications only starting at "3", which read as
 * two missing steps (24.7.3 attempt 4, feedback #5).
 */
export function sectionLabel(position: number, section: SetupSection): string {
  return `${position} · ${SECTION_NAME[section]}`;
}

/** Whole dollars with thousands separators, and two cents: what a money field shows. */
export function formatMoney(cents: number): string {
  const whole = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  return `${whole}.${String(cents % 100).padStart(2, '0')}`;
}

/** The cents a money field holds for a value, or null for none. */
export function moneyCents(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value * 100));
}

/**
 * Control → glyph, keyed by the generated union so a control the contract adds
 * is a typecheck failure at the next regeneration — a session then gives it a
 * row — rather than a wire token on screen.
 *
 * `AutomationSetupField` publishes no icon — unlike `AutomationCatalogEntry`,
 * which requires one — so the glyph is keyed by what the row *does*. Five
 * controls is few enough that this reads rather than being a lookup table
 * standing in for missing data. `resource-picker` is the contract's control for
 * a string that names a resource at the connected service — an inbox label, a
 * channel — which no published operation lists (backend ADR-0030 §1; the
 * validator holds its value to a string), so its row is the website's text
 * input (`ManifestFields.tsx`), under the text glyph: a control this build
 * knows, never the newer-than-this-build fallback below (25.8.1).
 */
export type KnownControl = SetupField['control'];

const CONTROL_ICON: Record<KnownControl, Icon> = {
  toggle: HandPalm,
  money: Sliders,
  text: Tray,
  'resource-picker': Tray,
  // The address control (backend, 2026-10-02): the email keyboard, an envelope.
  email: EnvelopeSimple,
};

/**
 * Whether this build has a row for a control (25.8.1). Own keys only, so a
 * manifest naming `constructor` is as unknown as one naming `date-range`.
 */
export function isKnownControl(control: string): control is KnownControl {
  return Object.prototype.hasOwnProperty.call(CONTROL_ICON, control);
}

/**
 * The line under a field whose control this build does not know, or null for
 * one it draws (25.8.1): the website falls back to a text input for any control
 * but `toggle` and `money` (`ManifestFieldInput`), and this app does the same,
 * saying why — so a new automation needs no app build (the owner's requirement
 * 1) and a person is not left guessing at a box with no explanation. The note
 * is one sentence from `lib/content`, never the wire token.
 */
export function controlNote(field: Pick<FieldRowSpec, 'control'>): string | null {
  return isKnownControl(field.control) ? null : NEWER_CONTROL_NOTE;
}

/**
 * Group fields under their sections in the manifest's own order, as the
 * website groups them (`SetupFields`): `setup` is published in manifest order,
 * and the contract declares each field's section but no order of sections, so
 * a group never moves a field ahead of an earlier one — the fields that follow
 * one another in a section are its group, and a section the manifest comes back
 * to is a group again. Until Gate 24's parity pass the design's fixed order
 * (connections, source, rules, notifications) moved them.
 */
export function bySection(fields: SetupField[]): { section: SetupSection; fields: SetupField[] }[] {
  const groups: { section: SetupSection; fields: SetupField[] }[] = [];
  for (const field of fields) {
    const last = groups[groups.length - 1];
    if (last?.section === field.section) last.fields.push(field);
    else groups.push({ section: field.section, fields: [field] });
  }
  return groups;
}

/**
 * What a notifications toggle switches, in the website's words: the manifest
 * allows `notifies` only on a toggle in the `notifications` section. Keyed by
 * the generated enum, so a value the contract adds is a typecheck failure at
 * the next regeneration rather than a wire token on screen.
 */
const NOTIFIES: Record<NonNullable<SetupField['notifies']>, string> = {
  'approval-requested': 'an approval is requested',
  'approval-expiring': 'an approval is about to expire',
  'run-failed': 'a run fails',
  'run-succeeded': 'a run succeeds',
};

/**
 * The line under a field that switches a notification, or null for one that
 * does not — and for a value a newer platform sends that this build has no
 * words for, which is never drawn as its token.
 */
export function notifiesLine(field: Pick<FieldRowSpec, 'notifies'>): string | null {
  const notifies = field.notifies;
  if (!notifies || !Object.prototype.hasOwnProperty.call(NOTIFIES, notifies)) return null;
  return `Controls the notification sent when ${NOTIFIES[notifies]}.`;
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
  return field.control === 'email' || /email/iu.test(`${field.key} ${field.title}`);
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
  // A control this build does not know draws under the text glyph, as its text input (25.8.1).
  const Glyph = isKnownControl(field.control) ? CONTROL_ICON[field.control] : CONTROL_ICON.text;
  const isMoney = field.control === 'money';
  const notifies = notifiesLine(field);
  const newer = controlNote(field);
  const externalValue = isMoney
    ? (() => {
        const cents = moneyCents(value);
        return cents === null ? '' : formatMoney(cents);
      })()
    : typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : '';
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
    if (isMoney) {
      // An amount is typed from the right, as a card terminal takes it: the digits
      // fill cents first, so "1" is $0.01, "12345" is $123.45, and a delete removes
      // the last digit. Only digits count; the number pad has nothing else
      // (24.7.3 attempt 4, feedback #4).
      const digits = next.replace(/\D/gu, '').replace(/^0+(?=\d)/u, '').slice(-12);
      if (digits === '') {
        setDraft('');
        lastEmitted.current = undefined;
        onChange(undefined);
        return;
      }
      const cents = Number(digits);
      const amount = cents / 100;
      setDraft(formatMoney(cents));
      lastEmitted.current = amount;
      onChange(amount);
      return;
    }
    setDraft(next);
    lastEmitted.current = next;
    onChange(next);
  };

  // Title line, then the description, then the control at full width: a field
  // that holds an address or an amount needs the whole row, not a box beside
  // the words (24.7.3 attempt 4, feedback #4). Optional fields say so by name.
  const body = (
    <>
      <View style={styles.titleLine}>
        <Glyph size={20} color={palette.accentRamp[300]} />
        <Text style={[styles.rowTitle, { color: palette.text }]}>{field.title}</Text>
        {!field.required ? (
          <Text style={[styles.optional, { color: palette.neutral[500] }]}>Optional</Text>
        ) : null}
        {field.control === 'toggle' ? (
          <NocToggle value={value === true} onChange={(next) => onChange(next)} />
        ) : null}
      </View>
      <Text style={[styles.rowSub, { color: palette.neutral[400] }]}>{field.description}</Text>
      {notifies ? <Text style={[styles.rowSub, { color: palette.neutral[400] }]}>{notifies}</Text> : null}
      {newer ? <Text style={[styles.rowSub, { color: palette.neutral[400] }]}>{newer}</Text> : null}
      {field.control === 'toggle' ? null : (
        <View
          style={[
            styles.inputWrap,
            { borderColor: palette.neutral[700], backgroundColor: palette.bg },
          ]}>
          {isMoney ? <Text style={[styles.currency, { color: palette.neutral[400] }]}>$</Text> : null}
          <TextInput
            accessibilityLabel={field.title}
            value={draft}
            onChangeText={changeText}
            placeholder={isMoney ? '0.00' : field.required ? 'Required' : 'Optional'}
            placeholderTextColor={palette.neutral[500]}
            keyboardType={isMoney ? 'number-pad' : isEmailField(field) ? 'email-address' : 'default'}
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
  // instead of inventing a provider-specific picker — `resource-picker` is a
  // known control drawn that way (25.8.1), and a control this build does not
  // know is drawn that way too, with `controlNote`'s line under it.
  return <View style={rowStyle}>{body}</View>;
}

const styles = StyleSheet.create({
  row: {
    gap: 6,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: { flex: 1, minWidth: 0, fontFamily: fonts.medium, fontSize: typeScale.label.fontSize },
  optional: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
  rowSub: { fontFamily: fonts.regular, ...typeScale.small, paddingLeft: 30 },
  inputWrap: {
    alignSelf: 'stretch',
    marginTop: 4,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  currency: { fontFamily: fonts.regular, fontSize: typeScale.lead.fontSize, marginRight: 2 },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 9,
    paddingHorizontal: 2,
    fontFamily: fonts.regular,
    fontSize: typeScale.lead.fontSize,
  },
});
