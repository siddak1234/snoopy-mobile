import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import {
  SetupFieldRow,
  bySection,
  missingRequiredSetupFields,
  type SetupField,
} from '@/components/setup-field';
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
  }) as SetupField;

describe('bySection', () => {
  it('groups into the design’s four sections, in the design’s order', () => {
    const groups = bySection([
      field({ section: 'notifications', key: 'n' }),
      field({ section: 'connections', key: 'c' }),
      field({ section: 'rules', key: 'r' }),
      field({ section: 'source', key: 's' }),
    ]);
    expect(groups.map((g) => g.section)).toEqual([
      'connections',
      'source',
      'rules',
      'notifications',
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
    expect(input.props.value).toBe('500');
    fireEvent.changeText(input, '625.50');
    expect(onChange).toHaveBeenCalledWith(625.5);
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
});
