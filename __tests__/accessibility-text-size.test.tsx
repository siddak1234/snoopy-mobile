import { screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { StatTileButton, StatTileRow } from '@/components/stat-tile-button';
import { ACCESSIBILITY_TEXT_SCALE } from '@/constants/theme';
import { useAccessibilityTextSize } from '@/hooks/use-accessibility-text-size';
import { renderWithProviders, setTextSize } from '@/test/render';

/**
 * Round 24's simulator audit (the owner's build 23 F14): at the largest text
 * size what sat side by side broke words inside themselves ("Succe/sses",
 * "Failure/s"). From iOS's first accessibility size it stacks.
 */

function Probe() {
  return <Text testID="probe">{useAccessibilityTextSize() ? 'stacked' : 'side by side'}</Text>;
}

function Tiles() {
  return (
    <StatTileRow testID="tiles">
      {['Runs', 'Successes', 'Failures'].map((label) => (
        <StatTileButton key={label} testID={`tile-${label}`} accessibilityLabel={label} onPress={() => {}} value="7" label={label} />
      ))}
    </StatTileRow>
  );
}

describe('useAccessibilityTextSize', () => {
  it('is iOS\'s first accessibility size, Accessibility Medium (x1.786)', () => {
    expect(ACCESSIBILITY_TEXT_SCALE).toBe(1.786);
  });

  it.each([
    [1, 'side by side'],
    [1.353, 'side by side'], // xxxLarge, the largest standard size
    [1.786, 'stacked'],
    [3.571, 'stacked'], // the largest
  ])('at x%s: %s', async (fontScale, words) => {
    const restore = setTextSize(fontScale);
    try {
      await renderWithProviders(<Probe />);
      expect(screen.getByTestId('probe').props.children).toBe(words);
    } finally {
      restore();
    }
  });
});

describe('StatTileRow', () => {
  it('side by side at the standard sizes, each tile a third', async () => {
    await renderWithProviders(<Tiles />);
    expect(StyleSheet.flatten(screen.getByTestId('tiles').props.style).flexDirection).toBe('row');
    expect(StyleSheet.flatten(screen.getByTestId('tile-Successes').props.style)?.flex).toBe(1);
  });

  it('one under another at the largest size, each tile the row\'s width (no third to break a word in)', async () => {
    const restore = setTextSize(3.571);
    try {
      await renderWithProviders(<Tiles />);
      expect(StyleSheet.flatten(screen.getByTestId('tiles').props.style).flexDirection).toBeUndefined();
      expect(StyleSheet.flatten(screen.getByTestId('tile-Successes').props.style)?.flex).toBeUndefined();
    } finally {
      restore();
    }
  });
});
