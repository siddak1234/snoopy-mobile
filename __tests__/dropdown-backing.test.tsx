import { act, fireEvent, screen, within } from '@testing-library/react-native';
import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';

import { Dropdown, dropdownLines, optionGroups } from '@/components/dropdown';
import { GlassSurface } from '@/components/glass-surface';
import { Pressable } from '@/components/pressable';
import { GLASS_BACKING_ALPHA, nocturneDark, nocturneLight, withAlpha } from '@/constants/theme';
import { renderWithProviders } from '@/test/render';

/**
 * Round 24 P1 (the owner's build 23 F1, F13, F14): one drop-down standard. The
 * one `Dropdown` lays an opaque card-colour backing under its glass, so a panel
 * reads over a busy page (Home) as it does over an empty one (Add a flow), on
 * every form of the glass.
 */

const glass = jest.requireMock('expo-glass-effect') as { isLiquidGlassAvailable: jest.Mock };

afterEach(() => {
  glass.isLiquidGlassAvailable.mockReturnValue(false);
});

function alphaOf(color: string): number {
  const match = /rgba\(\d+,\d+,\d+,([\d.]+)\)/.exec(color);
  return match ? Number(match[1]) : NaN;
}

function Menu({ onClosed }: { onClosed?: () => void } = {}) {
  return (
    <Dropdown
      testID="pick"
      onClosed={onClosed}
      options={[
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
      ]}
      value="a"
      onChange={() => {}}
      trigger={({ onPress }) => (
        <Pressable testID="pick-trigger" onPress={onPress}>
          <Text>Open</Text>
        </Pressable>
      )}
    />
  );
}

describe.each<[string, 'ios' | 'android', boolean]>([
  ['iOS 26 (Liquid Glass)', 'ios', true],
  ['iOS before 26 (blur)', 'ios', false],
  ['Android', 'android', false],
])('Dropdown on %s', (_name, os, liquid) => {
  it('opens on an opaque backing of the card colour, under the rows — nothing of the page shows through (~~0.9 or more~~ until the simulator audit)', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', os);
    try {
      glass.isLiquidGlassAvailable.mockReturnValue(liquid);
      await renderWithProviders(<Menu />);
      await fireEvent.press(screen.getByTestId('pick-trigger'));
      // Decorative: hidden from VoiceOver beside the menu's modal content, so asked for with hidden elements.
      const backing = screen.getByTestId('pick-menu-backing', { includeHiddenElements: true });
      const color = StyleSheet.flatten(backing.props.style).backgroundColor as string;
      expect(alphaOf(color)).toBe(1);
      expect(color).toBe(withAlpha(nocturneDark.surface, GLASS_BACKING_ALPHA));
      expect(backing.props.pointerEvents).toBe('none');
      // Under the rows: the menu's content comes after it.
      expect(screen.getByText('Alpha')).toBeTruthy();
    } finally {
      platform.restore();
    }
  });
});

describe('GlassSurface backing', () => {
  it('none by default; `page` is the page colour, in the light palette too', async () => {
    const view = await renderWithProviders(<GlassSurface radius={0} testID="g" />);
    expect(screen.queryByTestId('g-backing')).toBeNull();
    await view.unmount();
    await renderWithProviders(<GlassSurface radius={0} backing="page" testID="g" />, undefined, 'light');
    expect(StyleSheet.flatten(screen.getByTestId('g-backing').props.style).backgroundColor).toBe(
      withAlpha(nocturneLight.bg, GLASS_BACKING_ALPHA),
    );
  });
});

describe('Dropdown rows', () => {
  it('wrap a long name rather than cut it short, as iOS\'s own menus do (round 24\'s simulator audit: "Harbor…", "All categ…")', async () => {
    await renderWithProviders(<Menu />);
    await fireEvent.press(screen.getByTestId('pick-trigger'));
    expect(screen.getByText('Alpha').props.numberOfLines).toBeUndefined();
  });
});

/**
 * Options that carry `group` (Round 21 platform round 2, B1): under their headings, the groups in the
 * order they first appear. A setup select with groups opens its sheet since the owner's build 34 F1
 * (`SelectSheet`, which lists `optionGroups` too); the panel keeps the headings for any other list.
 */
describe('Dropdown groups', () => {
  const CODES = [
    { value: 'N18.4', label: 'Chronic kidney disease, stage 4', group: 'Kidney' },
    { value: 'I10', label: 'Essential hypertension', group: 'Heart' },
    { value: 'N18.5', label: 'Chronic kidney disease, stage 5', group: 'Kidney' },
    { value: 'E11.9', label: 'Type 2 diabetes', group: 'Endocrine' },
  ];

  it('the groups in the order they first appear, each its options in their own order; no group, the name ""', () => {
    expect(optionGroups(CODES).map((group) => [group.name, group.options.map((option) => option.value)])).toEqual([
      ['Kidney', ['N18.4', 'N18.5']],
      ['Heart', ['I10']],
      ['Endocrine', ['E11.9']],
    ]);
    expect(optionGroups([{ value: 'a' }, { value: 'b', group: 'B' }]).map((group) => group.name)).toEqual(['', 'B']);
    expect(dropdownLines(CODES, 'stage').map((line) => ('heading' in line ? line.heading : line.option.value))).toEqual(['Kidney', 'N18.4', 'N18.5']);
  });

  it('draws each heading over its options', async () => {
    await renderWithProviders(
      <Dropdown
        testID="codes"
        title="Codes"
        options={CODES}
        value={null}
        onChange={() => {}}
        trigger={({ onPress }) => (
          <Pressable testID="codes-trigger" onPress={onPress}>
            <Text>Codes</Text>
          </Pressable>
        )}
      />,
    );
    await fireEvent.press(screen.getByTestId('codes-trigger'));
    expect(within(screen.getByTestId('codes-menu')).getAllByText(/./u).map((node) => node.props.children)).toEqual([
      'CODES',
      'KIDNEY',
      'Chronic kidney disease, stage 4',
      'Chronic kidney disease, stage 5',
      'HEART',
      'Essential hypertension',
      'ENDOCRINE',
      'Type 2 diabetes',
    ]);
  });
});

/**
 * `onClosed` (the owner's build 43 item 17): Home's Upload menu runs Take photo
 * or Choose file only once the panel is gone, so the camera or the picker never
 * opens over it. iOS says it is gone through the Modal's `onDismiss` (React
 * Native implements it on iOS only); elsewhere it is gone once it closes.
 */
describe('Dropdown onClosed', () => {
  /** The `onDismiss` the open panel's Modal was given (the test calls it as iOS would). */
  function modalDismiss(): unknown {
    let at: ReturnType<typeof screen.getByTestId> | null = screen.getByTestId('pick-menu');
    while (at && !('onDismiss' in at.props)) at = at.parent;
    return at?.props.onDismiss;
  }

  it('on iOS: not while the panel hides, then once from the Modal\'s onDismiss', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'ios');
    try {
      const onClosed = jest.fn();
      await renderWithProviders(<Menu onClosed={onClosed} />);
      await fireEvent.press(screen.getByTestId('pick-trigger'));
      const dismissed = modalDismiss() as () => void;
      expect(typeof dismissed).toBe('function');
      await fireEvent.press(screen.getByText('Beta'));
      expect(screen.queryByTestId('pick-menu')).toBeNull();
      expect(onClosed).not.toHaveBeenCalled();
      await act(async () => dismissed());
      expect(onClosed).toHaveBeenCalledTimes(1);
    } finally {
      platform.restore();
    }
  });

  it('on Android: once, right after it closes — a press outside alike; no onDismiss is given', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      const onClosed = jest.fn();
      await renderWithProviders(<Menu onClosed={onClosed} />);
      await fireEvent.press(screen.getByTestId('pick-trigger'));
      expect(modalDismiss()).toBeUndefined();
      expect(onClosed).not.toHaveBeenCalled();
      await fireEvent.press(screen.getByText('Beta'));
      expect(onClosed).toHaveBeenCalledTimes(1);
      await fireEvent.press(screen.getByTestId('pick-trigger'));
      await fireEvent.press(screen.getByTestId('pick-backdrop'));
      expect(onClosed).toHaveBeenCalledTimes(2);
    } finally {
      platform.restore();
    }
  });

  it('without onClosed the Modal is given no onDismiss, as before', async () => {
    await renderWithProviders(<Menu />);
    await fireEvent.press(screen.getByTestId('pick-trigger'));
    expect(modalDismiss()).toBeUndefined();
  });
});
