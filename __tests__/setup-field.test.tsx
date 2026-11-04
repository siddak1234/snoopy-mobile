import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react-native';

import {
  SetupFieldRow,
  bySection,
  controlNote,
  declaredValues,
  formatMoney,
  isEmailField,
  isKnownControl,
  missingRequiredSetupFields,
  notifiesLine,
  placeholderOf,
  sectionLabel,
  selectedChoices,
  type SetupField,
} from '@/components/setup-field';
import { CHOOSE_AT_LEAST_ONE, NEWER_CONTROL_NOTE, chosenLabel } from '@/lib/content/screen-states';
import { renderWithProviders } from '@/test/render';

/**
 * The generated configuration surface.
 *
 * BUILD-PLAN §2.2 closes `setup.control` at four values because "each is a widget
 * both clients must render", and `setup.section` at four because "the mobile
 * design has exactly four sections". These tests hold that every declared
 * combination renders — a manifest that declares a control this screen cannot
 * draw would break the promise in §2.3 that a new automation costs "one repo, one
 * deploy — zero platform change".
 */

const field = (over: Partial<SetupField>): SetupField =>
  ({
    section: 'rules',
    key: 'k',
    title: 'Hold on mismatch',
    description: 'Pause when the amount differs',
    control: 'toggle',
    required: false,
    ...over,
  });

describe('bySection', () => {
  it('groups in the manifest’s own order, as the website does — never the design’s fixed four (Gate 24 parity)', () => {
    const groups = bySection([
      field({ section: 'notifications', key: 'n' }),
      field({ section: 'connections', key: 'c' }),
      field({ section: 'rules', key: 'r' }),
      field({ section: 'source', key: 's' }),
    ]);
    expect(groups.map((g) => g.section)).toEqual([
      'notifications',
      'connections',
      'rules',
      'source',
    ]);
  });

  it('never moves a field ahead of an earlier one: a section the manifest comes back to is a group again', () => {
    const groups = bySection([
      field({ section: 'source', key: 's1' }),
      field({ section: 'source', key: 's2' }),
      field({ section: 'rules', key: 'r' }),
      field({ section: 'source', key: 's3' }),
    ]);
    expect(groups.map((g) => [g.section, g.fields.map((f) => f.key)])).toEqual([
      ['source', ['s1', 's2']],
      ['rules', ['r']],
      ['source', ['s3']],
    ]);
  });

  it('preserves manifest order within a section', () => {
    const groups = bySection([
      field({ key: 'first', title: 'First' }),
      field({ key: 'second', title: 'Second' }),
    ]);
    expect(groups[0].fields.map((f) => f.title)).toEqual(['First', 'Second']);
  });

  it('omits a section a manifest declares nothing for', () => {
    // An automation with no rules must not render an empty "3 · REVIEW RULES".
    const groups = bySection([field({ section: 'source', key: 's' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].section).toBe('source');
  });

  it('returns nothing for a manifest with no setup fields at all', () => {
    expect(bySection([])).toEqual([]);
  });
});

describe('required setup validation', () => {
  it('matches the catalog service rule without rejecting false or zero', () => {
    const fields = [
      field({ key: 'missing', title: 'Missing', required: true }),
      field({ key: 'empty', title: 'Empty', required: true }),
      field({ key: 'false', title: 'False', required: true }),
      field({ key: 'zero', title: 'Zero', required: true }),
      field({ key: 'defaulted', title: 'Defaulted', required: true, defaultValue: 'server-default' }),
      field({ key: 'optional', title: 'Optional', required: false }),
    ];

    expect(
      missingRequiredSetupFields(fields, { empty: '', false: false, zero: 0 })
        .map((item) => item.key),
    ).toEqual(['missing', 'empty']);
  });
});

describe('SetupFieldRow — every control the union permits', () => {
  it('renders a toggle and reports the change', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <SetupFieldRow field={field({ control: 'toggle' })} value={false} onChange={onChange} divider={false} />,
    );
    expect(screen.getByText('Hold on mismatch')).toBeTruthy();
    await fireEvent.press(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("read-only (a member's Set up, the stage 1 spec's S1-9): the switch is disabled and changes nothing", async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <SetupFieldRow field={field({ control: 'toggle' })} value={false} onChange={onChange} divider={false} readOnly />,
    );
    expect(screen.getByRole('switch').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders money as an editable number and reports a number', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <SetupFieldRow
        field={field({ control: 'money', title: 'Auto-approve under' })}
        value={500}
        onChange={onChange}
        divider={false}
      />,
    );
    const input = screen.getByLabelText('Auto-approve under');
    // Shown as currency; typed digits fill from the right (2026-10-02).
    expect(input.props.value).toBe('500.00');
    fireEvent.changeText(input, '625.50');
    expect(onChange).toHaveBeenCalledWith(625.5);
  });

  it('reads a comma-decimal keyboard\'s "12,50" as 12.5, not 12', async () => {
    // The decimal pad types the locale's separator (de, fr, pt-BR…).
    const onChange = jest.fn();
    await renderWithProviders(
      <SetupFieldRow field={field({ control: 'money', title: 'Amount' })} value={undefined} onChange={onChange} divider={false} />,
    );
    fireEvent.changeText(screen.getByLabelText('Amount'), '12,50');
    expect(onChange).toHaveBeenLastCalledWith(12.5);
  });

  it('renders text as an editable value', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <SetupFieldRow
        field={field({ control: 'text', title: 'Ledger account' })}
        value="6200 · Office supplies"
        onChange={onChange}
        divider={false}
      />,
    );
    const input = screen.getByLabelText('Ledger account');
    expect(input.props.value).toBe('6200 · Office supplies');
    fireEvent.changeText(input, '6300 · Travel');
    expect(onChange).toHaveBeenCalledWith('6300 · Travel');
  });

  it('edits a resource-picker as the opaque string the public contract permits', async () => {
    // Nothing in AutomationSetupField says WHAT a picker lists — no options and
    // no resource type. Filed in DESIGN-CONTRACT.md; the row still shows what is
    // configured rather than rendering blank.
    const onChange = jest.fn();
    await renderWithProviders(
      <SetupFieldRow
        field={field({ control: 'resource-picker', title: 'Watch inbox' })}
        value="AP-Invoices"
        onChange={onChange}
        divider={false}
      />,
    );
    const input = screen.getByLabelText('Watch inbox');
    expect(input.props.value).toBe('AP-Invoices');
    fireEvent.changeText(input, 'Receipts');
    expect(onChange).toHaveBeenCalledWith('Receipts');
  });

  it('renders a field with no configured value without crashing', async () => {
    await renderWithProviders(
      <SetupFieldRow field={field({ control: 'text' })} value={undefined} onChange={() => {}} divider={false} />,
    );
    expect(screen.getByLabelText('Hold on mismatch').props.value).toBe('');
  });

  it('draws no help line: the manifest’s description stays the manifest’s (Build 21, spec A6; the session’s S11; the owner’s build 20 item 3)', async () => {
    await renderWithProviders(
      <SetupFieldRow field={field({ description: 'Pause when the amount differs' })} value={true} onChange={() => {}} divider={false} />,
    );
    expect(screen.getByText('Hold on mismatch')).toBeTruthy();
    expect(screen.queryByText('Pause when the amount differs')).toBeNull();
  });

  it('says which notification a toggle controls, in the website’s words (Gate 24 parity) — its description not drawn', async () => {
    await renderWithProviders(
      <SetupFieldRow
        field={field({ section: 'notifications', title: 'Failure alerts', description: 'Email me', notifies: 'run-failed' })}
        value={true}
        onChange={() => {}}
        divider={false}
      />,
    );
    expect(screen.queryByText('Email me')).toBeNull();
    expect(screen.getByText('Controls the notification sent when a run fails.')).toBeTruthy();
  });

  it('draws no notification line for a field that switches none', async () => {
    await renderWithProviders(<SetupFieldRow field={field({})} value={true} onChange={() => {}} divider={false} />);
    expect(screen.queryByText(/Controls the notification/u)).toBeNull();
  });

  it('words every notification the contract names, and draws none for a value a newer platform adds', () => {
    expect(notifiesLine({ notifies: 'approval-requested' })).toBe('Controls the notification sent when an approval is requested.');
    expect(notifiesLine({ notifies: 'approval-expiring' })).toBe('Controls the notification sent when an approval is about to expire.');
    expect(notifiesLine({ notifies: 'run-failed' })).toBe('Controls the notification sent when a run fails.');
    expect(notifiesLine({ notifies: 'run-succeeded' })).toBe('Controls the notification sent when a run succeeds.');
    expect(notifiesLine({ notifies: 'run-held' as never })).toBeNull();
    expect(notifiesLine({ notifies: 'constructor' as never })).toBeNull();
    expect(notifiesLine({})).toBeNull();
  });
});

describe('an address field gets the email keyboard (24.7.3 attempt 2, feedback #2)', () => {
  it('reads an `email` control, and a text field named for email, as an address', () => {
    expect(isEmailField({ key: 'notifyEmail', title: 'Email the outcome to', control: 'text' })).toBe(true);
    expect(isEmailField({ key: 'to', title: 'Recipient', control: 'email' as never })).toBe(true);
    expect(isEmailField({ key: 'reference', title: 'Reference', control: 'text' })).toBe(false);
    expect(isEmailField({ key: 'holdAboveAmount', title: 'Hold above', control: 'money' })).toBe(false);
  });
});

describe('an amount is typed from the right, as currency (24.7.3 attempt 4, feedback #4)', () => {
  const money = { key: 'holdAboveAmount', title: 'Hold above', description: 'Threshold', control: 'money', required: false } as never;

  it('formats cents with thousands separators and two decimals', () => {
    expect(formatMoney(1)).toBe('0.01');
    expect(formatMoney(12345)).toBe('123.45');
    expect(formatMoney(123456789)).toBe('1,234,567.89');
    expect(formatMoney(50000)).toBe('500.00');
  });

  it('fills cents first as digits arrive, and a cleared field stays cleared', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<SetupFieldRow field={money} value={undefined} onChange={onChange} divider={false} />);
    const input = screen.getByLabelText('Hold above');
    expect(input.props.keyboardType).toBe('number-pad');
    await fireEvent.changeText(input, '1');
    expect(onChange).toHaveBeenLastCalledWith(0.01);
    expect(screen.getByLabelText('Hold above').props.value).toBe('0.01');
    await fireEvent.changeText(screen.getByLabelText('Hold above'), '0.012');
    expect(onChange).toHaveBeenLastCalledWith(0.12);
    await fireEvent.changeText(screen.getByLabelText('Hold above'), '0.1234567');
    expect(onChange).toHaveBeenLastCalledWith(12345.67);
    expect(screen.getByLabelText('Hold above').props.value).toBe('12,345.67');
    await fireEvent.changeText(screen.getByLabelText('Hold above'), '');
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    expect(screen.getByLabelText('Hold above').props.value).toBe('');
  });

  it("a text field's example is its box's placeholder in place of \"Optional\" (backend ADR-0048 amendment 5; the owner's build 34 F2); Optional beside the title stays", async () => {
    const npi = field({ key: 'npi', title: 'NPI', control: 'text', example: '1234567893' });
    await renderWithProviders(<SetupFieldRow field={npi} value={undefined} onChange={jest.fn()} divider={false} />);
    expect(screen.getByLabelText('NPI').props.placeholder).toBe('1234567893');
    expect(screen.getByText('Optional')).toBeTruthy();
    // No example, or not a text field: today's placeholder.
    expect(placeholderOf({ control: 'text', required: false })).toBe('Optional');
    expect(placeholderOf({ control: 'text', required: true })).toBe('Required');
    expect(placeholderOf({ control: 'text', required: true, example: '1234567893' })).toBe('1234567893');
    expect(placeholderOf({ control: 'email', required: false, example: 'a@b.test' })).toBe('Optional');
    expect(placeholderOf({ control: 'money', required: false, example: '12.00' })).toBe('0.00');
  });

  it('shows a stored amount formatted, and marks a field that is not required as Optional', async () => {
    await renderWithProviders(<SetupFieldRow field={money} value={500} onChange={jest.fn()} divider={false} />);
    expect(screen.getByLabelText('Hold above').props.value).toBe('500.00');
    expect(screen.getByText('Optional')).toBeTruthy();
  });

  it('numbers sections by their place on the screen, not by the design\'s fixed four, in the spec\'s words (§3.B)', () => {
    expect(sectionLabel(1, 'rules')).toBe('1 · SETTINGS');
    expect(sectionLabel(2, 'notifications')).toBe('2 · EMAIL');
    expect(sectionLabel(1, 'connections')).toBe('1 · CONNECT');
    expect(sectionLabel(3, 'source')).toBe('3 · SOURCE');
  });
});

describe('a control this build does not know (BUILD-PLAN 25.8.1, the owner\'s requirement 1)', () => {
  /** A control a newer platform publishes: the generated union is closed, so the row's own type takes the string. */
  const newer = { key: 'window', title: 'Review window', description: 'Which days to read', required: true, control: 'date-range' };

  it('renders as the website does — a text input — with the note that it is newer than this build, and reports the typed string', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<SetupFieldRow field={newer} value="2026-10-01..2026-10-07" onChange={onChange} divider={false} />);
    expect(screen.getByText('Review window')).toBeTruthy();
    expect(screen.queryByText('Which days to read')).toBeNull();
    expect(screen.getByText(NEWER_CONTROL_NOTE)).toBeTruthy();
    const input = screen.getByLabelText('Review window');
    expect(input.props.value).toBe('2026-10-01..2026-10-07');
    expect(input.props.keyboardType).toBe('default');
    fireEvent.changeText(input, 'last week');
    expect(onChange).toHaveBeenCalledWith('last week');
    // The text input, whatever the control's name suggests: no switch, no amount.
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText('$')).toBeNull();
  });

  it('never draws the wire token: the note is one sentence from lib/content, the same for every unknown control', () => {
    expect(controlNote({ control: 'date-range' })).toBe(NEWER_CONTROL_NOTE);
    expect(controlNote({ control: 'colour' })).toBe(NEWER_CONTROL_NOTE);
    expect(NEWER_CONTROL_NOTE).not.toMatch(/date-range|colour/u);
    expect(controlNote({ control: 'text' })).toBeNull();
  });

  it('knows the contract\'s controls, the setup dropdown (F1) among them, and nothing else — not a prototype name, not the run form\'s file, which RunFileField draws', () => {
    for (const control of ['toggle', 'money', 'text', 'email', 'resource-picker', 'select']) expect(isKnownControl(control)).toBe(true);
    expect(controlNote({ control: 'select' })).toBeNull();
    for (const control of ['date-range', 'artifact', 'constructor', 'hasOwnProperty', 'toString', '']) expect(isKnownControl(control)).toBe(false);
  });

  it('draws a resource-picker as a control it knows: the text input the website draws, holding the configured name, with no note', async () => {
    await renderWithProviders(
      <SetupFieldRow field={field({ control: 'resource-picker', title: 'Watch inbox' })} value="AP-Invoices" onChange={jest.fn()} divider={false} />,
    );
    expect(screen.getByLabelText('Watch inbox').props.value).toBe('AP-Invoices');
    expect(screen.queryByText(NEWER_CONTROL_NOTE)).toBeNull();
    expect(controlNote({ control: 'resource-picker' })).toBeNull();
  });

  it("sends an unknown control's value as the string the website sends, and leaves an empty one out for the platform to judge", () => {
    expect(declaredValues([{ key: 'window', control: 'date-range' }], { window: 'last week' })).toEqual({ window: 'last week' });
    expect(declaredValues([{ key: 'window', control: 'date-range' }], { window: '  ' })).toEqual({});
    expect(declaredValues([{ key: 'window', control: 'date-range' }], {})).toEqual({});
  });
});

/** The setup dropdown (Round 21's platform round, F1; words.md section 3). */
describe('a select: the glass dropdown, one choice or several', () => {
  const SPECIALTIES = ['Nephrology', 'Internal medicine', 'Cardiology', 'Endocrinology'];
  const select = (over: Partial<SetupField>): SetupField => ({
    section: 'rules',
    key: 'specialties',
    title: 'Specialties',
    description: 'The specialties your clinic treats.',
    control: 'select',
    required: true,
    options: SPECIALTIES,
    ...over,
  });

  it('its closed pill reads the choices: Choose, the choice, two by name, three or more as a count', () => {
    expect(chosenLabel([])).toBe('Choose');
    expect(chosenLabel(['Nephrology'])).toBe('Nephrology');
    expect(chosenLabel(['Nephrology', 'Cardiology'])).toBe('Nephrology, Cardiology');
    expect(chosenLabel(['Nephrology', 'Cardiology', 'Endocrinology'])).toBe('3 chosen');
  });

  it('several: the panel stays open, a tick on each chosen row, and a press toggles its row', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <SetupFieldRow field={select({ multiple: true })} value={['Nephrology']} onChange={onChange} divider={false} />,
    );
    expect(screen.getByText('Nephrology')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('setup-field-specialties-choice'));
    expect(screen.getByTestId('setup-field-specialties-choice-chosen-Nephrology')).toBeTruthy();
    expect(screen.queryByTestId('setup-field-specialties-choice-chosen-Cardiology')).toBeNull();
    await fireEvent.press(screen.getByTestId('setup-field-specialties-choice-option-Cardiology'));
    expect(onChange).toHaveBeenLastCalledWith(['Nephrology', 'Cardiology']);
    // Still open: another row can be chosen.
    expect(screen.getByTestId('setup-field-specialties-choice-menu')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('setup-field-specialties-choice-option-Nephrology'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("read-only (a member's Set up, the stage 1 spec's S1-9): the pill says the choice and opens nothing", async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <SetupFieldRow field={select({})} value="Nephrology" onChange={onChange} divider={false} readOnly />,
    );
    expect(screen.getByText('Nephrology')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('setup-field-specialties-choice'));
    expect(screen.queryByTestId('setup-field-specialties-choice-menu')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('three or more chosen: the pill says how many', async () => {
    await renderWithProviders(
      <SetupFieldRow
        field={select({ multiple: true })}
        value={['Nephrology', 'Cardiology', 'Endocrinology']}
        onChange={jest.fn()}
        divider={false}
      />,
    );
    expect(screen.getByLabelText('Specialties: 3 chosen')).toBeTruthy();
  });

  it('one: a press chooses it and closes the panel', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<SetupFieldRow field={select({})} value={undefined} onChange={onChange} divider={false} />);
    expect(screen.getByLabelText('Specialties: Choose')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('setup-field-specialties-choice'));
    await fireEvent.press(screen.getByTestId('setup-field-specialties-choice-option-Cardiology'));
    expect(onChange).toHaveBeenCalledWith('Cardiology');
    expect(screen.queryByTestId('setup-field-specialties-choice-menu')).toBeNull();
  });

  it('a required one left empty is missing, a default or not; what the save says is drawn under it', async () => {
    const fields = [select({ multiple: true, defaultValue: ['Nephrology'] }), select({ key: 'one' })];
    expect(missingRequiredSetupFields(fields, { specialties: [], one: '' }).map((item) => item.key)).toEqual(['specialties', 'one']);
    expect(missingRequiredSetupFields(fields, { specialties: ['Cardiology'], one: 'Cardiology' })).toEqual([]);
    await renderWithProviders(
      <SetupFieldRow field={select({ multiple: true })} value={[]} onChange={jest.fn()} divider={false} error={CHOOSE_AT_LEAST_ONE} />,
    );
    expect(screen.getByTestId('setup-field-specialties-error').props.children).toBe('Choose at least one.');
  });

  it('its value: a list for several (only the options, none twice), one string for one', () => {
    expect(selectedChoices({ options: SPECIALTIES }, ['Cardiology', 'Cardiology', 'Dermatology', 3])).toEqual(['Cardiology']);
    expect(
      declaredValues(
        [
          { key: 'several', control: 'select', options: SPECIALTIES, multiple: true },
          { key: 'one', control: 'select', options: SPECIALTIES },
          { key: 'none', control: 'select', options: SPECIALTIES },
        ],
        { several: ['Nephrology', 'Cardiology'], one: 'Cardiology', none: '' },
      ),
    ).toEqual({ several: ['Nephrology', 'Cardiology'], one: 'Cardiology' });
  });
});

/** The dropdown, bigger (Round 21 platform round 2, B1): object options, a search box past 10, group headings. */
describe('a select with many options: labels, groups and a search box', () => {
  const CODES = [
    { value: 'N18.4', label: 'Chronic kidney disease, stage 4', group: 'Kidney' },
    { value: 'I10', label: 'Essential hypertension', group: 'Heart' },
    { value: 'N18.5', label: 'Chronic kidney disease, stage 5', group: 'Kidney' },
    { value: 'E11.9', label: 'Type 2 diabetes', group: 'Endocrine' },
  ];
  const many = (count: number) => Array.from({ length: count }, (_, at) => `Option ${at + 1}`);
  const select = (over: Partial<SetupField>): SetupField => ({
    section: 'rules',
    key: 'codes',
    title: 'Codes',
    description: 'The codes to check.',
    control: 'select',
    required: true,
    options: CODES,
    ...over,
  });
  it('the closed pill shows labels, never values, and the picks show as chips by label; what is sent and saved is the value', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<SetupFieldRow field={select({ multiple: true })} value={['N18.4', 'I10']} onChange={onChange} divider={false} />);
    expect(screen.getByLabelText('Codes: Chronic kidney disease, stage 4, Essential hypertension')).toBeTruthy();
    expect(screen.queryByText(/N18\.4/u)).toBeNull();
    // The picks as chips, in the order chosen (the owner's build 34 F1).
    expect(screen.getByTestId('setup-field-codes-choice-chip-N18.4').props.children).toBe('Chronic kidney disease, stage 4');
    expect(screen.getByTestId('setup-field-codes-choice-chip-I10').props.children).toBe('Essential hypertension');
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice'));
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice-group-2'));
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice-option-E11.9'));
    expect(onChange).toHaveBeenLastCalledWith(['N18.4', 'I10', 'E11.9']);
    expect(selectedChoices({ options: CODES }, ['I10', 'Essential hypertension'])).toEqual(['I10']);
    expect(declaredValues([{ key: 'codes', control: 'select', options: CODES }], { codes: 'E11.9' })).toEqual({ codes: 'E11.9' });
  });

  it('options with groups open the full-height sheet: "Category" over the groups in the order they first appear, under the field\'s title — no option yet (the owner\'s build 34 F1)', async () => {
    await renderWithProviders(<SetupFieldRow field={select({})} value={undefined} onChange={jest.fn()} divider={false} />);
    expect(screen.queryByTestId('setup-field-codes-choice-sheet')).toBeNull();
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice'));
    const sheet = within(screen.getByTestId('setup-field-codes-choice-sheet'));
    // Not the anchored panel.
    expect(screen.queryByTestId('setup-field-codes-choice-menu')).toBeNull();
    expect(sheet.getByRole('header', { name: 'Codes' })).toBeTruthy();
    expect(sheet.getByText('CATEGORY')).toBeTruthy();
    expect(['Kidney', 'Heart', 'Endocrine'].map((name, at) => within(screen.getByTestId(`setup-field-codes-choice-group-${at}`)).getByText(name))).toHaveLength(3);
    expect(screen.queryByTestId('setup-field-codes-choice-group-3')).toBeNull();
    expect(screen.queryByTestId('setup-field-codes-choice-option-I10')).toBeNull();
    expect(screen.getByTestId('setup-field-codes-choice-search-all').props.placeholder).toBe('Search all');
  });

  it("step 2: a group's options alone under its name, narrowed by typing; Back goes to the groups, and Back again closes", async () => {
    await renderWithProviders(<SetupFieldRow field={select({ multiple: true })} value={[]} onChange={jest.fn()} divider={false} />);
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice'));
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice-group-0'));
    const sheet = within(screen.getByTestId('setup-field-codes-choice-sheet'));
    expect(sheet.getByRole('header', { name: 'Kidney' })).toBeTruthy();
    expect(screen.getByTestId('setup-field-codes-choice-option-N18.4')).toBeTruthy();
    expect(screen.getByTestId('setup-field-codes-choice-option-N18.5')).toBeTruthy();
    expect(screen.queryByTestId('setup-field-codes-choice-option-I10')).toBeNull();
    const box = screen.getByTestId('setup-field-codes-choice-search');
    expect(box.props.placeholder).toBe('Search');
    await fireEvent.changeText(box, 'stage 5');
    expect(screen.queryByTestId('setup-field-codes-choice-option-N18.4')).toBeNull();
    expect(screen.getByTestId('setup-field-codes-choice-option-N18.5')).toBeTruthy();
    await fireEvent.changeText(box, 'zzz');
    expect(screen.getByTestId('setup-field-codes-choice-no-matches').props.children).toBe('No matches.');
    // "No matches." alone: no empty card under it.
    expect(screen.queryAllByTestId('setup-field-codes-choice-options')).toHaveLength(0);
    await fireEvent.press(sheet.getByLabelText('Back'));
    expect(screen.getByTestId('setup-field-codes-choice-group-0')).toBeTruthy();
    expect(screen.queryByTestId('setup-field-codes-choice-search')).toBeNull();
    await fireEvent.press(within(screen.getByTestId('setup-field-codes-choice-sheet')).getByLabelText('Back'));
    expect(screen.queryByTestId('setup-field-codes-choice-sheet')).toBeNull();
  });

  it('"Search all" lists every option whose label holds the words, under its group\'s name, across groups; none: "No matches."', async () => {
    await renderWithProviders(<SetupFieldRow field={select({ multiple: true })} value={[]} onChange={jest.fn()} divider={false} />);
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice'));
    await fireEvent.changeText(screen.getByTestId('setup-field-codes-choice-search-all'), 'e');
    const sheet = within(screen.getByTestId('setup-field-codes-choice-sheet'));
    expect(sheet.queryByText('CATEGORY')).toBeNull();
    expect(sheet.getAllByText(/./u).map((node) => node.props.children)).toEqual([
      'Codes',
      'KIDNEY',
      'Chronic kidney disease, stage 4',
      'Chronic kidney disease, stage 5',
      'HEART',
      'Essential hypertension',
      'ENDOCRINE',
      'Type 2 diabetes',
    ]);
    await fireEvent.changeText(screen.getByTestId('setup-field-codes-choice-search-all'), 'diabetes');
    expect(screen.getByTestId('setup-field-codes-choice-option-E11.9')).toBeTruthy();
    expect(screen.queryByTestId('setup-field-codes-choice-option-I10')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('setup-field-codes-choice-search-all'), 'zzz');
    expect(screen.getByTestId('setup-field-codes-choice-no-matches').props.children).toBe('No matches.');
  });

  it('one: a pick chooses it and closes the sheet; closing forgets the step and the search', async () => {
    const one = jest.fn();
    await renderWithProviders(<SetupFieldRow field={select({})} value={undefined} onChange={one} divider={false} />);
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice'));
    await fireEvent.changeText(screen.getByTestId('setup-field-codes-choice-search-all'), 'hyper');
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice-option-I10'));
    expect(one).toHaveBeenLastCalledWith('I10');
    expect(screen.queryByTestId('setup-field-codes-choice-sheet')).toBeNull();
    // Opened again: the groups, the box empty.
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice'));
    expect(screen.getByTestId('setup-field-codes-choice-search-all').props.value).toBe('');
    expect(screen.getByTestId('setup-field-codes-choice-group-0')).toBeTruthy();
  });

  it('several: a pick ticks or unticks its row and the sheet stays', async () => {
    const several = jest.fn();
    await renderWithProviders(<SetupFieldRow field={select({ multiple: true })} value={['N18.4']} onChange={several} divider={false} />);
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice'));
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice-group-0'));
    expect(screen.getByTestId('setup-field-codes-choice-chosen-N18.4')).toBeTruthy();
    expect(screen.queryByTestId('setup-field-codes-choice-chosen-N18.5')).toBeNull();
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice-option-N18.5'));
    expect(several).toHaveBeenLastCalledWith(['N18.4', 'N18.5']);
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice-option-N18.4'));
    expect(several).toHaveBeenLastCalledWith([]);
    expect(screen.getByTestId('setup-field-codes-choice-sheet')).toBeTruthy();
  });

  it('more than 10 options: a search box ("Search") keeps the rows whose label holds the query; none: "No matches."', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <SetupFieldRow field={select({ options: many(11) })} value={undefined} onChange={onChange} divider={false} />,
    );
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice'));
    const box = screen.getByTestId('setup-field-codes-choice-search');
    expect(box.props.placeholder).toBe('Search');
    await fireEvent.changeText(box, 'option 1');
    // "Option 1", "Option 10" and "Option 11": every row whose label holds it, case-free.
    expect(screen.getByTestId('setup-field-codes-choice-option-Option 10')).toBeTruthy();
    expect(screen.queryByTestId('setup-field-codes-choice-option-Option 2')).toBeNull();
    await fireEvent.changeText(box, 'zzz');
    expect(screen.getByTestId('setup-field-codes-choice-no-matches').props.children).toBe('No matches.');
    await fireEvent.changeText(box, 'option 2');
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice-option-Option 2'));
    expect(onChange).toHaveBeenCalledWith('Option 2');
  });

  it('the search box is emptied on closing: opened again, it is empty and every row is back', async () => {
    await renderWithProviders(<SetupFieldRow field={select({ options: many(11) })} value={undefined} onChange={jest.fn()} divider={false} />);
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice'));
    await fireEvent.changeText(screen.getByTestId('setup-field-codes-choice-search'), 'option 1');
    expect(screen.queryByTestId('setup-field-codes-choice-option-Option 2')).toBeNull();
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice-backdrop'));
    expect(screen.queryByTestId('setup-field-codes-choice-search')).toBeNull();
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice'));
    expect(screen.getByTestId('setup-field-codes-choice-search').props.value).toBe('');
    expect(within(screen.getByTestId('setup-field-codes-choice-menu')).getAllByText(/^Option /u)).toHaveLength(11);
  });

  it('ten options or fewer, with no groups: no search box and no heading — the plain dropdown, unchanged', async () => {
    await renderWithProviders(<SetupFieldRow field={select({ options: many(10) })} value={undefined} onChange={jest.fn()} divider={false} />);
    await fireEvent.press(screen.getByTestId('setup-field-codes-choice'));
    expect(screen.queryByTestId('setup-field-codes-choice-search')).toBeNull();
    expect(screen.queryByTestId('setup-field-codes-choice-group-0')).toBeNull();
    expect(screen.queryByTestId('setup-field-codes-choice-no-matches')).toBeNull();
    expect(within(screen.getByTestId('setup-field-codes-choice-menu')).getAllByText(/^Option /u)).toHaveLength(10);
  });
});
