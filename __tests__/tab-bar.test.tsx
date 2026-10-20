import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';

import { NocturneTabBar, lensOffset } from '@/components/nocturne/tab-bar';
import { nocturneDark, withAlpha } from '@/constants/theme';
import { renderWithProviders } from '@/test/render';
import { makeTabBarProps as makeProps } from '@/test/tab-bar-props';

// The lens's motion (round 24, P2): the real functions, watched.
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { __esModule: true, ...actual, withTiming: jest.fn(actual.withTiming), withSpring: jest.fn(actual.withSpring) };
});

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

  /** Lets the lens's slide (240 ms) finish. */
  const settle = () =>
    act(async () => {
      await new Promise((done) => setTimeout(done, 320));
    });

  function harness(start: number) {
    let focus: (index: number) => void = () => undefined;
    function Harness() {
      const [index, setIndex] = React.useState(start);
      focus = setIndex;
      return <NocturneTabBar {...makeProps(index).props} />;
    }
    return { Harness, focus: (index: number) => focus(index) };
  }

  const lensOf = (view: { getByTestId: (id: string) => { props: Record<string, any> } }) => {
    const lens = view.getByTestId('tab-bar-lens');
    return { ...StyleSheet.flatten(lens.props.style), ...(lens.props.jestAnimatedStyle?.value ?? {}) } as {
      left?: number;
      width?: number;
      opacity?: number;
      borderRadius?: number;
      backgroundColor?: string;
      transform?: { translateX: number }[];
    };
  };

  it('sits the lens under the focused tab, in the accent at 16%, and moves it when the focus changes', async () => {
    const { Harness, focus } = harness(1);
    const view = await renderWithProviders(<Harness />);
    // Not laid out yet: no lens to place.
    expect(view.queryByTestId('tab-bar-lens')).toBeNull();
    // 4 + 4 × 80 + 4: each tab 80 wide.
    await layOut(view.getByTestId, 328);
    await settle();
    expect(lensOf(view)).toMatchObject({ left: 0, width: 80, borderRadius: 999, opacity: 1, transform: [{ translateX: 4 + 80 }] });
    expect(lensOf(view).backgroundColor).toBe(withAlpha(nocturneDark.accent, 0.16));

    await act(async () => focus(3));
    await settle();
    expect(lensOf(view).transform).toEqual([{ translateX: 4 + 3 * 80 }]);
    await act(async () => focus(0));
    await settle();
    expect(lensOf(view).transform).toEqual([{ translateX: 4 }]);
  });
});

/**
 * Round 24 P2 (the owner's build 23 F2, F3: "it should slide and latch on, not
 * move around initially"): the lens latches on its first layout — nothing
 * animates — and slides on a focus change with a timing, never a spring, so it
 * cannot overshoot and shake; Reduce Motion moves it at once.
 */
describe('the tab lens slides and latches (round 24, P2)', () => {
  const Reanimated = jest.requireMock('react-native-reanimated') as { withTiming: jest.Mock; withSpring: jest.Mock };

  const layOut = async (getByTestId: (id: string) => { props: object }, width: number) =>
    fireEvent(getByTestId('tab-bar-row') as never, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 62 } } });

  it.each([
    [320, [4, 82, 160, 238]],
    [393, [4, 100.25, 196.5, 292.75]],
    [440, [4, 112, 220, 328]],
  ])('lensOffset: the pad plus whole tab widths, four tabs in a %i-pt row', (width, offsets) => {
    expect([0, 1, 2, 3].map((slot) => lensOffset(slot, width, 4))).toEqual(offsets);
    // Each offset is the tab's own start, so the lens is centred under its tab.
    const tab = (width - 8) / 4;
    expect(lensOffset(2, width, 4) + tab / 2).toBeCloseTo(4 + 2.5 * tab);
  });

  it('the first layout sets the lens where it belongs: no timing, no spring, no layout transition', async () => {
    const view = await renderWithProviders(<NocturneTabBar {...makeProps(2).props} />);
    await layOut(view.getByTestId, 328);
    expect(Reanimated.withTiming).not.toHaveBeenCalled();
    expect(Reanimated.withSpring).not.toHaveBeenCalled();
    const lens = view.getByTestId('tab-bar-lens');
    expect(lens.props.layout).toBeUndefined();
    expect(lens.props.jestAnimatedStyle.value).toMatchObject({ opacity: 1, transform: [{ translateX: 4 + 2 * 80 }] });
  });

  it('a new focus slides it with a 240-ms timing, never a spring', async () => {
    let focus: (index: number) => void = () => undefined;
    function Harness() {
      const [index, setIndex] = React.useState(0);
      focus = setIndex;
      return <NocturneTabBar {...makeProps(index).props} />;
    }
    const view = await renderWithProviders(<Harness />);
    await layOut(view.getByTestId, 328);
    await act(async () => focus(2));
    expect(Reanimated.withTiming).toHaveBeenCalledTimes(1);
    expect(Reanimated.withTiming).toHaveBeenCalledWith(4 + 2 * 80, expect.objectContaining({ duration: 240 }));
    expect(Reanimated.withSpring).not.toHaveBeenCalled();
  });

  it('a new row width re-sets it without a slide', async () => {
    const view = await renderWithProviders(<NocturneTabBar {...makeProps(1).props} />);
    await layOut(view.getByTestId, 328);
    await layOut(view.getByTestId, 408);
    expect(Reanimated.withTiming).not.toHaveBeenCalled();
    expect(view.getByTestId('tab-bar-lens').props.jestAnimatedStyle.value.transform).toEqual([{ translateX: 4 + 100 }]);
  });

  it('under Reduce Motion a new focus moves it at once', async () => {
    const motion = AccessibilityInfo.isReduceMotionEnabled as jest.Mock;
    const asItWas = motion.getMockImplementation();
    motion.mockResolvedValue(true);
    try {
      let focus: (index: number) => void = () => undefined;
      function Harness() {
        const [index, setIndex] = React.useState(0);
        focus = setIndex;
        return <NocturneTabBar {...makeProps(index).props} />;
      }
      const view = await renderWithProviders(<Harness />);
      await act(async () => undefined);
      await layOut(view.getByTestId, 328);
      await act(async () => focus(3));
      expect(Reanimated.withTiming).not.toHaveBeenCalled();
      expect(view.getByTestId('tab-bar-lens').props.jestAnimatedStyle.value.transform).toEqual([{ translateX: 4 + 3 * 80 }]);
    } finally {
      motion.mockImplementation(asItWas);
    }
  });
});
