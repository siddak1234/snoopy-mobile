import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

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
  sectionLabel,
  type SetupField,
} from '@/components/setup-field';
import { NEWER_CONTROL_NOTE } from '@/lib/content/screen-states';
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

  it('always shows the manifest’s own description as the second line', async () => {
    await renderWithProviders(
      <SetupFieldRow field={field({ description: 'Pause when the amount differs' })} value={true} onChange={() => {}} divider={false} />,
    );
    expect(screen.getByText('Pause when the amount differs')).toBeTruthy();
  });

  it('says which notification a toggle controls, in the website’s words, under its description (Gate 24 parity)', async () => {
    await renderWithProviders(
      <SetupFieldRow
        field={field({ section: 'notifications', title: 'Failure alerts', description: 'Email me', notifies: 'run-failed' })}
        value={true}
        onChange={() => {}}
        divider={false}
      />,
    );
    expect(screen.getByText('Email me')).toBeTruthy();
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

  it('shows a stored amount formatted, and marks a field that is not required as Optional', async () => {
    await renderWithProviders(<SetupFieldRow field={money} value={500} onChange={jest.fn()} divider={false} />);
    expect(screen.getByLabelText('Hold above').props.value).toBe('500.00');
    expect(screen.getByText('Optional')).toBeTruthy();
  });

  it('numbers sections by their place on the screen, not by the design\'s fixed four', () => {
    expect(sectionLabel(1, 'rules')).toBe('1 · REVIEW RULES');
    expect(sectionLabel(2, 'notifications')).toBe('2 · NOTIFICATIONS');
    expect(sectionLabel(1, 'connections')).toBe('1 · CONNECTIONS');
  });
});

describe('a control this build does not know (BUILD-PLAN 25.8.1, the owner\'s requirement 1)', () => {
  /** A control a newer platform publishes: the generated union is closed, so the row's own type takes the string. */
  const newer = { key: 'window', title: 'Review window', description: 'Which days to read', required: true, control: 'date-range' };

  it('renders as the website does — a text input — with the note that it is newer than this build, and reports the typed string', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<SetupFieldRow field={newer} value="2026-10-01..2026-10-07" onChange={onChange} divider={false} />);
    expect(screen.getByText('Review window')).toBeTruthy();
    expect(screen.getByText('Which days to read')).toBeTruthy();
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

  it('knows the contract\'s five controls and nothing else — not a prototype name, not the run form\'s file, which RunFileField draws', () => {
    for (const control of ['toggle', 'money', 'text', 'email', 'resource-picker']) expect(isKnownControl(control)).toBe(true);
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
