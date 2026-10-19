import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';

import { NocturneTabBar } from '@/components/nocturne/tab-bar';
import { nocturneDark, withAlpha } from '@/constants/theme';
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

  it('ticks on a tab press — the selection haptic, through the shared pressable now (build 11, D7)', async () => {
    const Haptics = jest.requireMock('expo-haptics');
    const { props } = makeProps(0);
    const { getByText } = await renderWithProviders(<NocturneTabBar {...props} />);
    await fireEvent.press(getByText('Flows'));
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('does not navigate when pressing the already-active tab', async () => {
    const { props, navigation } = makeProps(0);
    const { getByText } = await renderWithProviders(<NocturneTabBar {...props} />);
    await fireEvent.press(getByText('Home'));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  /** Lays the capsule's row out at `width`, as the phone would. */
  const layOut = async (getByTestId: (id: string) => { props: object }, width: number) =>
    fireEvent(getByTestId('tab-bar-row') as never, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 62 } } });

  it('floats the four tabs in a capsule of glass, 16 pt in from each side on the page colour, with no hairline on top (round 23, A3)', async () => {
    const { props } = makeProps(0);
    const { getByTestId } = await renderWithProviders(<NocturneTabBar {...props} />);
    const band = StyleSheet.flatten(getByTestId('tab-bar').props.style);
    expect(band).toMatchObject({ backgroundColor: nocturneDark.bg, paddingHorizontal: 16 });
    expect(band.borderTopWidth).toBeUndefined();
    expect(StyleSheet.flatten(getByTestId('tab-bar-capsule').props.style)).toMatchObject({ borderRadius: 999 });
    expect(StyleSheet.flatten(getByTestId('tab-bar-row').props.style)).toMatchObject({ height: 62 });
  });

  it('sits the lens under the focused tab, in the accent at 16%, and moves it when the focus changes', async () => {
    let focus: (index: number) => void = () => undefined;
    function Harness() {
      const [index, setIndex] = React.useState(1);
      focus = setIndex;
      return <NocturneTabBar {...makeProps(index).props} />;
    }
    const view = await renderWithProviders(<Harness />);
    // Not laid out yet: no lens to place.
    expect(view.queryByTestId('tab-bar-lens')).toBeNull();
    // 4 + 4 × 80 + 4: each tab 80 wide.
    await layOut(view.getByTestId, 328);
    const lens = () => StyleSheet.flatten(view.getByTestId('tab-bar-lens').props.style);
    expect(lens()).toMatchObject({ left: 4 + 80, width: 80, borderRadius: 999 });
    expect(lens().backgroundColor).toBe(withAlpha(nocturneDark.accent, 0.16));

    await act(async () => focus(3));
    expect(lens()).toMatchObject({ left: 4 + 3 * 80, width: 80 });
    await act(async () => focus(0));
    expect(lens().left).toBe(4);
  });
});
