import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { NocturneTabBar } from '@/components/nocturne/tab-bar';
import { nocturneDark } from '@/constants/theme';
import { renderWithProviders } from '@/test/render';

const ROUTES = ['index', 'flows', 'builder', 'activity', 'settings'];

function makeProps(activeIndex = 0) {
  const navigation = {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  };
  const props = {
    state: {
      index: activeIndex,
      routes: ROUTES.map((name) => ({ key: `${name}-key`, name })),
    },
    descriptors: Object.fromEntries(
      ROUTES.map((name) => [`${name}-key`, { options: {} }]),
    ),
    navigation,
  } as unknown as BottomTabBarProps;
  return { props, navigation };
}

describe('NocturneTabBar', () => {
  it('renders the five design tabs in order', async () => {
    const { props } = makeProps();
    const { getByText } = await renderWithProviders(<NocturneTabBar {...props} />);
    for (const label of ['Home', 'Flows', 'Build', 'Activity', 'Settings']) {
      expect(getByText(label)).toBeTruthy();
    }
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
