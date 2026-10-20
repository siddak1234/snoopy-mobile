import { screen } from '@testing-library/react-native';
import React from 'react';

import { Text, TextInput } from '@/components/text';
import { fontScaleLimit } from '@/constants/theme';
import { renderWithProviders } from '@/test/render';

/**
 * Round 24 P3 (the owner's build 23 F14: "based on the users phone size and font
 * size from their native ios system"): the app's Text and TextInput follow the
 * phone's text size up to 2× unless the caller says otherwise; text in a fixed
 * bar passes the chrome limit.
 */
describe('components/text', () => {
  it('limits are 2 for content and 1.35 for chrome (S4)', () => {
    expect(fontScaleLimit).toEqual({ content: 2, chrome: 1.35 });
  });

  it('Text follows the phone up to the content limit by default, and forwards every prop', async () => {
    await renderWithProviders(
      <Text testID="t" numberOfLines={2} accessibilityRole="header">
        Runs
      </Text>,
    );
    const text = screen.getByTestId('t');
    expect(text.props.maxFontSizeMultiplier).toBe(2);
    expect(text.props.numberOfLines).toBe(2);
    expect(text.props.accessibilityRole).toBe('header');
    expect(screen.getByText('Runs')).toBeTruthy();
  });

  it("the caller's limit wins", async () => {
    await renderWithProviders(
      <Text testID="t" maxFontSizeMultiplier={fontScaleLimit.chrome}>
        Home
      </Text>,
    );
    expect(screen.getByTestId('t').props.maxFontSizeMultiplier).toBe(1.35);
  });

  it('TextInput too: the content limit by default, the caller’s when given', async () => {
    const view = await renderWithProviders(<TextInput testID="i" value="Acme" onChangeText={() => {}} />);
    expect(screen.getByTestId('i').props.maxFontSizeMultiplier).toBe(2);
    expect(screen.getByTestId('i').props.value).toBe('Acme');
    await view.unmount();
    await renderWithProviders(<TextInput testID="i" maxFontSizeMultiplier={1} />);
    expect(screen.getByTestId('i').props.maxFontSizeMultiplier).toBe(1);
  });
});
