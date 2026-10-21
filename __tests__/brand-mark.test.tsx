import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { BrandMark } from '@/components/nocturne/brand-mark';
import { Pressable } from '@/components/pressable';
import { useTheme, type ThemeMode } from '@/hooks/use-theme';
import { renderWithProviders } from '@/test/render';

/**
 * The owner's build 24 item 2: "In light mode the logo should be black right or the purple matching
 * automation x AI" — the mark stayed white after Settings › Appearance moved to Light while Home was
 * open. iOS makes an image tintable only when it loads with a tint (React Native 0.81's
 * RCTImageComponentView: the template rendering at load, a later `tintColor` only recolours a
 * template), so the mark is tinted in both palettes — white on dark, #212121 (the design's invert(.87)) on light — and a switch
 * recolours it at once.
 */

function Switch({ to }: { to: ThemeMode }) {
  const { setMode } = useTheme();
  return (
    <Pressable testID={`to-${to}`} onPress={() => setMode(to)}>
      <Text>{to}</Text>
    </Pressable>
  );
}

const tintOf = () => StyleSheet.flatten(screen.getByTestId('mark').props.style).tintColor;

describe('BrandMark', () => {
  it('is tinted in both palettes, through a switch either way — never untinted', async () => {
    await renderWithProviders(
      <>
        <BrandMark testID="mark" width={86} />
        <Switch to="light" />
        <Switch to="dark" />
      </>,
    );
    expect(tintOf()).toBe('#ffffff');
    await fireEvent.press(screen.getByTestId('to-light'));
    expect(tintOf()).toBe('#212121');
    await fireEvent.press(screen.getByTestId('to-dark'));
    expect(tintOf()).toBe('#ffffff');
  });
});
