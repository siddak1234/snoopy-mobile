import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { StatTileButton, StatTileRow, TILE_LEAST_WIDTH, tilesStack } from '@/components/stat-tile-button';
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

/** The row laid out at a phone's width: an iPhone 17 Pro (402 pt) less Home's 20-pt gutters. */
async function tilesAt(fontScale: number, rowWidth = 362) {
  const restore = setTextSize(fontScale);
  try {
    await renderWithProviders(<Tiles />);
    await fireEvent(screen.getByTestId('tiles'), 'layout', { nativeEvent: { layout: { width: rowWidth, height: 80, x: 0, y: 0 } } });
    return {
      direction: StyleSheet.flatten(screen.getByTestId('tiles').props.style).flexDirection,
      flex: StyleSheet.flatten(screen.getByTestId('tile-Successes').props.style)?.flex,
    };
  } finally {
    restore();
  }
}

describe('tilesStack — measured on the round 24 simulator audit', () => {
  it('a tile needs 100 pt per unit of text size', () => {
    expect(TILE_LEAST_WIDTH).toBe(100);
  });

  it.each([
    ['iPhone SE, standard: "Successes" fits a 105-pt tile', 335, 1, false],
    ['iPhone SE, xLarge', 335, 1.118, true],
    ['iPhone 17 Pro, standard', 362, 1, false],
    ['iPhone 17 Pro, xLarge', 362, 1.118, false],
    ['iPhone 17 Pro, xxxLarge: "Successe/s" broke in a 114-pt tile', 362, 1.353, true],
    ['iPhone 17 Pro Max, xxLarge', 400, 1.235, false],
    ['any phone at the largest size', 400, 3.571, true],
  ])('%s', (_case, rowWidth, fontScale, stacks) => {
    expect(tilesStack(rowWidth, 3, fontScale)).toBe(stacks);
  });
});

describe('StatTileRow', () => {
  it('side by side at the standard size, each tile a third', async () => {
    expect(await tilesAt(1)).toEqual({ direction: 'row', flex: 1 });
  });

  it.each([1.353, 3.571])('one under another at x%s, each tile the row\'s width (no third to break a word in)', async (fontScale) => {
    expect(await tilesAt(fontScale)).toEqual({ direction: undefined, flex: undefined });
  });
});
