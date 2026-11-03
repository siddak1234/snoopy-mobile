import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { EnvelopeSimple, HandPalm, ListBullets, PlugsConnected, Sliders, Tray, type Icon } from 'phosphor-react-native';

import { Chip } from '@/components/blocks/badge';
import { Dropdown } from '@/components/dropdown';
import { NocToggle } from '@/components/nocturne/noc-toggle';
import { SectionLabel } from '@/components/nocturne/section-label';
import { Text, TextInput } from '@/components/text';
import { fonts, iconSize, inset, space, status, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ScopePill } from '@/components/scope-control';
import { SelectSheet } from '@/components/select-sheet';
import { NEWER_CONTROL_NOTE, chosenLabel } from '@/lib/content/screen-states';
import type { components } from '@/lib/generated/platform-contracts/automations';

/** A setup field; `select` (F1, Round 21's platform round) carries its `options` and `multiple`. */
export type SetupField = components['schemas']['AutomationSetupField'];
/** One section of a flow's Set up, as its manifest declares it (`setupSections`, backend ADR-0048 amendment 5). */
export type SetupSectionDeclaration = components['schemas']['AutomationSetupSectionDeclaration'];

/** Whether a field is the setup dropdown (F1). */
export function isSelectField(field: { control: string }): boolean {
  return field.control === 'select';
}

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
export type FieldRowSpec = Pick<SetupField, 'key' | 'title' | 'description' | 'required' | 'notifies' | 'options' | 'multiple' | 'example'> & {
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

/**
 * Each section's name, in the spec's words (the Invoice Processing update, §3.B;
 * the owner's build 19 item 8: "So much ai slop wording … No numbered category
 * steps"): ~~CONNECTIONS, REVIEW RULES, NOTIFICATIONS~~ until 2026-10-14.
 */
export const SECTION_NAME: Record<SetupSection, string> = {
  connections: 'CONNECT',
  source: 'SOURCE',
  rules: 'SETTINGS',
  notifications: 'EMAIL',
};

/**
 * A section's heading, numbered by its place on the screen — 1 … N over the
 * sections an automation actually has. The design's fixed numbers left an
 * automation with rules and notifications only starting at "3", which read as
 * two missing steps (24.7.3 attempt 4, feedback #5).
 */
export function sectionLabel(position: number, section: SetupSection): string {
  return numberedName(position, SECTION_NAME[section]);
}

/** A heading's name at its place: "{n} · {name}" (a manifest's own section's too, `setupGroups`). */
export function numberedName(position: number, name: string): string {
  return `${position} · ${name}`;
}

/**
 * A numbered section's heading, as the design contract draws a step of a form
 * (spec §3.0 rule 1): "1 · CONNECT", at the label size, in the text colour — a
 * step to take, not a quiet kicker.
 */
export function NumberedSectionLabel({ children, testID }: { children: string; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View testID={testID} style={styles.numbered}>
      <SectionLabel fontSize={typeScale.label.fontSize} color={palette.text} style={{ lineHeight: typeScale.label.fontSize }}>
        {children}
      </SectionLabel>
    </View>
  );
}

/**
 * Every connection choice a version declares — one per step that uses a
 * connection (backend ADR-0040, BUILD-PLAN 25.4.30; Build 21's C4). Invoice
 * Processing declares one; v2's has no `providers` and covers every optional
 * connection.
 */
export function connectionFields<T extends { control: string }>(setup: readonly T[]): T[] {
  return setup.filter((field) => field.control === 'connection');
}

/**
 * The vendors one connection field chooses among, in the manifest's order: the
 * optional connections it names (`providers`), or — a field without
 * `providers`, the one of a version that declares only one (ADR-0040; the
 * spec's S8) — every optional connection.
 */
export function fieldProviders<C extends { providerId: string; optional?: boolean }>(
  field: { providers?: readonly string[] } | undefined,
  connections: readonly C[],
): C[] {
  const optional = connections.filter((connection) => connection.optional);
  if (!field?.providers) return optional;
  const named = new Set(field.providers);
  return optional.filter((connection) => named.has(connection.providerId));
}

/** The fields a form draws as rows: every field but the vendor choice, drawn as its vendors under CONNECT. */
export function rowFields<T extends { control: string }>(setup: readonly T[]): T[] {
  return setup.filter((field) => field.control !== 'connection');
}

/** What a flow's vendor choice holds now: its saved value, else its default, else None. */
export function chosenVendor(
  field: { key: string; defaultValue?: unknown } | undefined,
  config: Record<string, unknown> | undefined,
): string {
  if (!field) return 'none';
  const value = config?.[field.key] ?? field.defaultValue;
  return typeof value === 'string' && value !== '' ? value : 'none';
}

/** The glyph a setting row is drawn with: its control's, or the text glyph for one this build does not know (25.8.1). */
export function controlIcon(control: string): Icon {
  return isKnownControl(control) ? CONTROL_ICON[control] : CONTROL_ICON.text;
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
 * which requires one — so the glyph is keyed by what the row *does*. Seven
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
  // The vendor choice (backend ADR-0037): never a row of its own — its page is
  // Connect integration — but known, so no screen says it is newer than this build.
  connection: PlugsConnected,
  // The setup dropdown (Round 21's platform round, F1): the item select's list glyph.
  select: ListBullets,
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
 * Set up's sections, each its heading's name and its fields (the owner's
 * build 34 F3: "we need to split this out. 1. Npi 2 specialty 3
 * connectors/integrations"). A manifest that declares `setupSections`
 * (backend ADR-0048 amendment 5): its sections in its order, each by its
 * title in the numbered heading's capitals, holding its fields by `sectionId`
 * in manifest order — a vendor choice among them, drawn in the section it
 * names — and a section with nothing to draw left out, as the website's.
 * Without them, the four fixed sections (`bySection`), the vendor choice
 * left to CONNECT (`rowFields`).
 */
export function setupGroups(
  setup: SetupField[],
  sections: readonly SetupSectionDeclaration[] | undefined,
): { name: string; fields: SetupField[] }[] {
  if (!sections || sections.length === 0) {
    return bySection(rowFields(setup)).map(({ section, fields }) => ({ name: SECTION_NAME[section], fields }));
  }
  return sections
    .map((section) => ({
      name: section.title.toUpperCase(),
      fields: setup.filter((field) => field.sectionId === section.id),
    }))
    .filter((group) => group.fields.length > 0);
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

/**
 * Mirrors the catalog service's required-config predicate exactly. A list
 * (a several-choice `select`, F1) that is empty counts as missing, a default
 * or not: a required one is never saved empty.
 */
export function missingRequiredSetupFields<F extends Pick<SetupField, 'key' | 'required' | 'defaultValue'>>(
  fields: F[],
  values: Record<string, unknown>,
): F[] {
  return fields.filter((field) => {
    if (!field.required) return false;
    const value = values[field.key];
    if (Array.isArray(value)) return value.length === 0;
    if (field.defaultValue !== undefined) return false;
    return value === undefined || value === null || value === '';
  });
}

/** One choice of a `select` (Round 21 platform round 2, B1): what is saved, what is shown, the heading it is under. */
export type SelectOption = { value: string; label: string; group?: string };

/**
 * A `select`'s options in one shape (B1): a string is its own value and
 * label (as before); an object option is as sent (`value`, `label`, `group`).
 */
export function selectOptions(field: { options?: readonly (string | SelectOption)[] }): SelectOption[] {
  return (field.options ?? []).map((option) =>
    typeof option === 'string'
      ? { value: option, label: option }
      : { value: option.value, label: option.label, ...(option.group !== undefined ? { group: option.group } : {}) },
  );
}

/**
 * What a `select` holds, as its option values (F1; B1): a string is one
 * choice, a list several, each one of the field's option values, none twice,
 * in the order chosen; anything else, none.
 */
export function selectedChoices(field: { options?: readonly (string | SelectOption)[] }, value: unknown): string[] {
  const options = new Set(selectOptions(field).map((option) => option.value));
  const raw = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  return [...new Set(raw.filter((choice): choice is string => typeof choice === 'string' && options.has(choice)))];
}

/**
 * The values a manifest-driven form holds, in the type each control promises —
 * the one conversion the Set up form and the Run form both need (the website's
 * `declaredValues`). A toggle is always sent; an empty text or money field, and
 * a file not yet uploaded, are left out, so the platform applies the manifest's
 * default or refuses a required one; a file field that takes several sends the
 * list of its upload ids. The platform stays the validator.
 */
export function declaredValues(
  fields: readonly { key: string; control: string; options?: readonly (string | SelectOption)[]; multiple?: boolean }[],
  values: Record<string, unknown>,
): Record<string, string | string[] | number | boolean> {
  const declared: Record<string, string | string[] | number | boolean> = {};
  for (const field of fields) {
    const value = values[field.key];
    if (field.control === 'toggle') declared[field.key] = value === true;
    else if (field.control === 'select') {
      // A list for a field that allows several (F1), sent even empty; one choice, or nothing, for one that does not.
      const chosen = selectedChoices(field, value);
      if (field.multiple) declared[field.key] = chosen;
      else if (chosen[0] !== undefined) declared[field.key] = chosen[0];
    }
    else if (field.control === 'money') {
      if (typeof value === 'number' && Number.isFinite(value)) declared[field.key] = value;
    } else if (field.control === 'artifact' && field.multiple) {
      // A file field that takes several (the batch addendum): the list of upload ids, all into one run; none held, nothing sent.
      const ids = Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
      if (ids.length > 0) declared[field.key] = ids;
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

/**
 * The box's placeholder: an amount's "0.00"; a `text` field's `example`
 * (backend ADR-0048 amendment 5; the owner's build 34 F2: "Maybe add an
 * example one rather than optional in the text field"), as the website's;
 * else "Required" or "Optional". "Optional" beside the title stays.
 */
export function placeholderOf(field: Pick<FieldRowSpec, 'control' | 'required' | 'example'>): string {
  if (field.control === 'money') return '0.00';
  if (field.control === 'text' && field.example) return field.example;
  return field.required ? 'Required' : 'Optional';
}

/**
 * The input itself: an amount typed from the right, an address with the email
 * keyboard, any other text — or, for a switch, the switch. What a row draws
 * under its title (a switch, on its title line).
 */
export function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldRowSpec;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const { palette } = useTheme();
  const isMoney = field.control === 'money';
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

  if (field.control === 'toggle') {
    return <NocToggle value={value === true} onChange={(next) => onChange(next)} />;
  }
  if (field.control === 'select') return <SelectInput field={field} value={value} onChange={onChange} />;

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

  return (
    <View style={[styles.inputWrap, { borderColor: palette.neutral[700], backgroundColor: palette.bg }]}>
      {isMoney ? <Text style={[styles.currency, { color: palette.neutral[400] }]}>$</Text> : null}
      <TextInput
        accessibilityLabel={field.title}
        value={draft}
        onChangeText={changeText}
        placeholder={placeholderOf(field)}
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
  );
}

/**
 * A `select` (Round 21's platform round, F1): the glass dropdown
 * (`components/dropdown.tsx`) behind the item select's pill (`ScopePill`), its
 * options in the manifest's order. One choice closes the panel; a field that
 * allows several (`multiple`) keeps it open, a tick on each chosen row, and a
 * press toggles its row. The closed pill reads the choices (`chosenLabel`:
 * "Choose", "{first}, {second}", "{n} chosen") by their labels, never their
 * values (Round 21 platform round 2, B1); more than 10 get the dropdown's
 * search box. Options that carry `group` open the full-height sheet instead
 * (`SelectSheet`: "Category", then a group's options, and "Search all"; the
 * owner's build 34 F1; ~~drawn under their headings in the dropdown~~), and
 * the picks show as chips under the pill.
 *
 * testIDs: the pill `setup-field-${key}-choice`, a row
 * `setup-field-${key}-choice-option-${value}`, a pick's chip
 * `setup-field-${key}-choice-chip-${value}`.
 */
function SelectInput({
  field,
  value,
  onChange,
}: {
  field: FieldRowSpec;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const several = field.multiple === true;
  const options = selectOptions(field);
  const chosen = selectedChoices(field, value);
  const labelOf = new Map(options.map((option) => [option.value, option.label]));
  const label = chosenLabel(chosen.map((choice) => labelOf.get(choice) ?? choice));
  const testID = `setup-field-${field.key}-choice`;
  const pick = (next: string) => {
    if (several) {
      onChange(chosen.includes(next) ? chosen.filter((choice) => choice !== next) : [...chosen, next]);
      return;
    }
    onChange(next);
    setOpen(false);
  };
  const pill = (
    <ScopePill
      testID={testID}
      icon={ListBullets}
      label={label}
      accessibilityLabel={`${field.title}: ${label}`}
      onPress={() => setOpen(true)}
    />
  );
  if (options.some((option) => option.group !== undefined)) {
    return (
      <View style={styles.grouped}>
        <View style={styles.pill}>{pill}</View>
        {chosen.length > 0 ? (
          <View style={styles.chips}>
            {chosen.map((choice) => (
              <Chip key={choice} testID={`${testID}-chip-${choice}`} badge={{ text: labelOf.get(choice) ?? choice }} />
            ))}
          </View>
        ) : null}
        <SelectSheet
          testID={testID}
          title={field.title}
          options={options}
          chosen={chosen}
          multiple={several}
          open={open}
          onChoose={pick}
          onClose={() => setOpen(false)}
        />
      </View>
    );
  }
  return (
    <View style={styles.pill}>
      <Dropdown
        testID={testID}
        title={field.title}
        options={options}
        value={several ? null : (chosen[0] ?? null)}
        values={several ? chosen : undefined}
        open={open}
        onOpenChange={setOpen}
        onChange={pick}
        trigger={pill}
      />
    </View>
  );
}

/**
 * One row of Set up and of a run's form: the title line —
 * glyph, title, "Optional", a switch inline — then the input at full width.
 * **No help line under it** (Build 21, spec A6 and B5; the session's S11; the
 * owner's build 20 item 3: "What is the gets a short summary even mean"): the
 * manifest's `description` stays the manifest's record and is not drawn. A
 * notification switch's line and the newer-control note stay: they say what
 * the row does, not what the field means.
 */
export function SetupFieldRow({
  field,
  value,
  onChange,
  divider,
  error,
}: {
  field: FieldRowSpec;
  value: unknown;
  onChange: (next: unknown) => void;
  divider: boolean;
  /** What the save said of this field ("Choose at least one."), under it. */
  error?: string | null;
}) {
  const { palette } = useTheme();
  // A control this build does not know draws under the text glyph, as its text input (25.8.1).
  const Glyph = controlIcon(field.control);
  const notifies = notifiesLine(field);
  const newer = controlNote(field);

  // Title line, then the control at full width: a field that holds an address
  // or an amount needs the whole row, not a box beside the words (24.7.3
  // attempt 4, feedback #4). Optional fields say so by name.
  return (
    <View style={[styles.row, divider && { borderBottomWidth: 1, borderBottomColor: palette.divider }]}>
      <View style={styles.titleLine}>
        <Glyph size={iconSize.row} color={palette.accentRamp[300]} />
        <Text style={[styles.rowTitle, { color: palette.text }]}>{field.title}</Text>
        {!field.required ? (
          <Text style={[styles.optional, { color: palette.neutral[500] }]}>Optional</Text>
        ) : null}
        {field.control === 'toggle' ? <FieldInput field={field} value={value} onChange={onChange} /> : null}
      </View>
      {notifies ? <Text style={[styles.rowSub, { color: palette.neutral[400] }]}>{notifies}</Text> : null}
      {newer ? <Text style={[styles.rowSub, { color: palette.neutral[400] }]}>{newer}</Text> : null}
      {/* The public contract has no resource-list operation or resource kind. Match
          the completed web client: accept its opaque string value in a text input
          instead of inventing a provider-specific picker — `resource-picker` is a
          known control drawn that way (25.8.1), and a control this build does not
          know is drawn that way too, with `controlNote`'s line under it. */}
      {field.control === 'toggle' ? null : <FieldInput field={field} value={value} onChange={onChange} />}
      {error ? (
        <Text accessibilityRole="alert" testID={`setup-field-${field.key}-error`} style={[styles.fieldError, { color: status.err }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // A numbered title over its card: one em tall, `title` above the card.
  numbered: { marginBottom: space.title },
  row: {
    gap: space.inner,
    paddingVertical: space.rowY,
    paddingHorizontal: space.rowX,
  },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: space.inner },
  rowTitle: { flex: 1, minWidth: 0, fontFamily: fonts.medium, fontSize: typeScale.label.fontSize },
  optional: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
  // Under the title, past the glyph and its gap.
  rowSub: { fontFamily: fonts.regular, ...typeScale.small, paddingLeft: iconSize.row + space.inner },
  inputWrap: {
    alignSelf: 'stretch',
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.rowX,
  },
  // The pill keeps its own width, as the item select's does.
  pill: { flexDirection: 'row' },
  // A grouped select: the pill, then its picks as chips, `inner` apart.
  grouped: { gap: space.inner },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.inner },
  fieldError: { fontFamily: fonts.medium, ...typeScale.small },
  currency: { fontFamily: fonts.regular, fontSize: typeScale.lead.fontSize, marginRight: inset.xxs },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: space.inner,
    paddingHorizontal: inset.xxs,
    fontFamily: fonts.regular,
    fontSize: typeScale.lead.fontSize,
  },
});
