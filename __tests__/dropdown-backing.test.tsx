import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';

import { Dropdown } from '@/components/dropdown';
import { GlassSurface } from '@/components/glass-surface';
import { Pressable } from '@/components/pressable';
import { GLASS_BACKING_ALPHA, nocturneDark, nocturneLight, withAlpha } from '@/constants/theme';
import { renderWithProviders } from '@/test/render';

/**
 * Round 24 P1 (the owner's build 23 F1, F13, F14): one drop-down standard. The
 * one `Dropdown` lays a 94% card-colour backing under its glass, so a panel
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

function Menu() {
  return (
    <Dropdown
      testID="pick"
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
  it('opens on a backing of the card colour at 0.9 or more, under the rows', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', os);
    try {
      glass.isLiquidGlassAvailable.mockReturnValue(liquid);
      await renderWithProviders(<Menu />);
      await fireEvent.press(screen.getByTestId('pick-trigger'));
      // Decorative: hidden from VoiceOver beside the menu's modal content, so asked for with hidden elements.
      const backing = screen.getByTestId('pick-menu-backing', { includeHiddenElements: true });
      const color = StyleSheet.flatten(backing.props.style).backgroundColor as string;
      expect(alphaOf(color)).toBeGreaterThanOrEqual(0.9);
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
