import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { SetupFieldRow, bySection, type SetupField } from '@/components/setup-field';
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

  it('renders money with the currency the design draws', async () => {
    await renderWithProviders(
      <SetupFieldRow
        field={field({ control: 'money', title: 'Auto-approve under' })}
        value={500}
        onChange={() => {}}
        divider={false}
      />,
    );
    expect(screen.getByText('$500')).toBeTruthy();
  });

  it('renders text as its value', async () => {
    await renderWithProviders(
      <SetupFieldRow
        field={field({ control: 'text', title: 'Ledger account' })}
        value="6200 · Office supplies"
        onChange={() => {}}
        divider={false}
      />,
    );
    expect(screen.getByText('6200 · Office supplies')).toBeTruthy();
  });

  it('renders a resource-picker’s current value even though it cannot enumerate', async () => {
    // Nothing in AutomationSetupField says WHAT a picker lists — no options and
    // no resource type. Filed in DESIGN-CONTRACT.md; the row still shows what is
    // configured rather than rendering blank.
    await renderWithProviders(
      <SetupFieldRow
        field={field({ control: 'resource-picker', title: 'Watch inbox' })}
        value="AP-Invoices"
        onChange={() => {}}
        divider={false}
      />,
    );
    expect(screen.getByText('AP-Invoices')).toBeTruthy();
  });

  it('renders a field with no configured value without crashing', async () => {
    await renderWithProviders(
      <SetupFieldRow field={field({ control: 'text' })} value={undefined} onChange={() => {}} divider={false} />,
    );
    expect(screen.getByText('Hold on mismatch')).toBeTruthy();
  });

  it('always shows the manifest’s own description as the second line', async () => {
    await renderWithProviders(
      <SetupFieldRow field={field({ description: 'Pause when the amount differs' })} value={true} onChange={() => {}} divider={false} />,
    );
    expect(screen.getByText('Pause when the amount differs')).toBeTruthy();
  });
});
