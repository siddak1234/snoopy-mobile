import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent } from '@testing-library/react-native';

import { NocturneTabBar } from '@/components/nocturne/tab-bar';
import { nocturneDark } from '@/constants/theme';
import { renderWithProviders } from '@/test/render';
import { makeTabBarProps as makeProps } from '@/test/tab-bar-props';

describe('NocturneTabBar', () => {
  it('renders the four tabs in order — Solutions folded into Flows (24.9.3)', async () => {
    const { props } = makeProps();
    const { getByText, queryByText } = await renderWithProviders(<NocturneTabBar {...props} />);
    for (const label of ['Home', 'Flows', 'Activity', 'Settings']) {
      expect(getByText(label)).toBeTruthy();
    }
    expect(queryByText('Solutions')).toBeNull();
  });

  it('tints the active tab with the accent and the rest neutral-500', async () => {
    const { props } = makeProps(0);
    const { getByText } = await renderWithProviders(<NocturneTabBar {...props} />);
    const color = (label: string) =>
      (StyleSheet.flatten(getByText(label).props.style) as { color?: string }).color;
    expect(color('Home')).toBe(nocturneDark.accent);
    expect(color('Flows')).toBe(nocturneDark.neutral[500]);
  });

  it('navigates on press of an inactive tab', async () => {
    const { props, navigation } = makeProps(0);
    const { getByText } = await renderWithProviders(<NocturneTabBar {...props} />);
    await fireEvent.press(getByText('Flows'));
    expect(navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabPress', target: 'flows-key' }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith('flows', undefined);
  });

  it('does not navigate when pressing the already-active tab', async () => {
    const { props, navigation } = makeProps(0);
    const { getByText } = await renderWithProviders(<NocturneTabBar {...props} />);
    await fireEvent.press(getByText('Home'));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
