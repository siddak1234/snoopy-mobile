import { act, fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo, Dimensions, Platform, StyleSheet, Text } from 'react-native';

import { redirectSystemPath } from '@/app/+native-intent';
import { Dropdown, placeDropdown } from '@/components/dropdown';
import { GlassSurface } from '@/components/glass-surface';
import { Pressable } from '@/components/pressable';
import { glassTint, nocturneDark, withAlpha } from '@/constants/theme';
import { linkTargetOf } from '@/hooks/use-push-registration';
import { renderWithProviders } from '@/test/render';

/**
 * Round 23 (the owner's build 22 feedback): the Liquid Glass primitive's three
 * forms (A3), the one drop-down (A2), and what an email's or a push's link
 * opens (A5).
 */

const glass = jest.requireMock('expo-glass-effect') as { isLiquidGlassAvailable: jest.Mock };
const MockNativeMethods = jest.requireActual('react-native/jest/MockNativeMethods').default as {
  measureInWindow: jest.Mock;
};

afterEach(() => {
  glass.isLiquidGlassAvailable.mockReturnValue(false);
  MockNativeMethods.measureInWindow.mockReset();
});

describe('GlassSurface (A3): the system glass on iOS 26, a blur below it, the opaque card on Android', () => {
  it('iOS with Liquid Glass: the GlassView, regular, interactive on a button, in the app scheme, tinted — no ring', async () => {
    glass.isLiquidGlassAvailable.mockReturnValue(true);
    await renderWithProviders(<GlassSurface radius={999} interactive tone="accent" testID="g" />);
    const view = screen.getByTestId('g');
    expect(view.props).toMatchObject({
      glassEffectStyle: 'regular',
      isInteractive: true,
      colorScheme: 'dark',
      tintColor: glassTint(nocturneDark, 'accent'),
    });
    expect(StyleSheet.flatten(view.props.style).borderWidth).toBeUndefined();
    expect(screen.queryByTestId('g-blur')).toBeNull();
    expect(glassTint(nocturneDark, 'neutral')).toBe(withAlpha(nocturneDark.surface, 0.35));
  });

  it('iOS below 26: a blur at 40 under the card colour at 55%, in a hairline ring', async () => {
    await renderWithProviders(
      <GlassSurface radius={18} testID="g">
        <Text>Inside</Text>
      </GlassSurface>,
    );
    const view = screen.getByTestId('g');
    expect(view.props.glassEffectStyle).toBeUndefined();
    expect(StyleSheet.flatten(view.props.style)).toMatchObject({ borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: nocturneDark.neutral[800] });
    expect(screen.getByTestId('g-blur').props).toMatchObject({ intensity: 40, tint: 'dark' });
    expect(screen.getByText('Inside')).toBeTruthy();
  });

  it("Android: today's look — the card colour at 92% in a hairline ring, no blur, no glass", async () => {
    const android = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      glass.isLiquidGlassAvailable.mockReturnValue(true);
      await renderWithProviders(<GlassSurface radius={999} testID="g" />);
      const view = screen.getByTestId('g');
      expect(view.props.glassEffectStyle).toBeUndefined();
      expect(StyleSheet.flatten(view.props.style)).toMatchObject({
        backgroundColor: withAlpha(nocturneDark.surface, 0.92),
        borderWidth: 1,
        borderColor: nocturneDark.neutral[800],
      });
      expect(screen.queryByTestId('g-blur')).toBeNull();
    } finally {
      android.restore();
    }
  });
});

describe('placeDropdown (A2): where a panel goes', () => {
  const phone = { width: 402, height: 874 };

  it('under the trigger, 6 pt down, on its nearer edge, at least 232 wide, at most 380 tall', () => {
    expect(placeDropdown({ x: 20, y: 100, width: 120, height: 34 }, phone)).toEqual({
      left: 20,
      width: 232,
      top: 140,
      maxHeight: 380,
      placement: 'below',
      align: 'start',
    });
    // Nearer the right edge: its end edge on the trigger's.
    const end = placeDropdown({ x: 300, y: 100, width: 38, height: 38 }, phone);
    expect(end).toMatchObject({ align: 'end', left: 338 - 232, width: 232 });
  });

  it('never past a 16-pt gutter, never wider than the screen less its gutters', () => {
    expect(placeDropdown({ x: 380, y: 100, width: 10, height: 30 }, phone, 'start').left).toBe(402 - 16 - 232);
    expect(placeDropdown({ x: 0, y: 100, width: 600, height: 30 }, phone).width).toBe(402 - 32);
  });

  it('above when fewer than 240 pt are left below and more above; its height the room less 16', () => {
    const low = placeDropdown({ x: 20, y: 700, width: 120, height: 34 }, phone);
    expect(low).toMatchObject({ placement: 'above', bottom: 874 - 694, maxHeight: 380 });
    expect(low.top).toBeUndefined();
    // 230 below but even less above: below, as tall as there is room.
    const tight = placeDropdown({ x: 20, y: 200, width: 120, height: 34 }, { width: 402, height: 470 });
    expect(tight).toMatchObject({ placement: 'below', top: 240, maxHeight: 470 - 240 - 16 });
  });
});

describe('Dropdown (A2): a menu on its trigger', () => {
  const OPTIONS = [
    { value: 'a', label: 'Alpha', sub: 'The first' },
    { value: 'b', label: 'Beta' },
  ] as const;

  function Menu({ onChange = jest.fn(), locked = false }: { onChange?: (value: 'a' | 'b') => void; locked?: boolean }) {
    return (
      <Dropdown
        testID="pick"
        title="Pick one"
        options={OPTIONS}
        value="a"
        onChange={onChange}
        locked={locked}
        trigger={({ onPress, expanded }) => (
          <Pressable testID="pick-trigger" accessibilityState={{ expanded }} onPress={onPress}>
            <Text>Open</Text>
          </Pressable>
        )}
      />
    );
  }

  it('opens a menu — no dialog — titled in caps, each row a menu item with the chosen one checked; choosing applies and closes', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<Menu onChange={onChange} />);
    expect(screen.queryByTestId('pick-menu')).toBeNull();
    await fireEvent.press(screen.getByTestId('pick-trigger'));
    expect(screen.getByTestId('pick-menu')).toBeTruthy();
    expect(screen.getByText('PICK ONE')).toBeTruthy();
    expect(screen.getByText('The first')).toBeTruthy();
    const alpha = screen.getByTestId('pick-option-a');
    expect(alpha.props.accessibilityRole).toBe('menuitem');
    expect(alpha.props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getAllByTestId('pick-chosen')).toHaveLength(1);
    await fireEvent.press(screen.getByTestId('pick-option-b'));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.queryByTestId('pick-menu')).toBeNull();
  });

  it.each([
    [false, [{ scale: 1 }]],
    [true, []],
  ])('opening it, Reduce Motion %s: it fades in, and grows only with motion (transform %j)', async (reduced, transform) => {
    // The system's answer, then react-native's own mock's again (a spy's restore would leave it answering nothing).
    const motion = AccessibilityInfo.isReduceMotionEnabled as jest.Mock;
    const asItWas = motion.getMockImplementation();
    motion.mockResolvedValue(reduced);
    try {
      await renderWithProviders(<Menu />);
      await fireEvent.press(screen.getByTestId('pick-trigger'));
      await act(async () => {
        await new Promise((settle) => setTimeout(settle, 300));
      });
      // The panel: the animated view around the menu's glass.
      const panel = screen.getByTestId('pick-menu').parent!;
      expect(panel.props.jestAnimatedStyle.value).toEqual({ opacity: 1, transform });
    } finally {
      motion.mockImplementation(asItWas);
    }
  });

  it('a tap outside closes it, choosing nothing — unless it is locked', async () => {
    const onChange = jest.fn();
    const view = await renderWithProviders(<Menu onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('pick-trigger'));
    expect(screen.getByTestId('pick-backdrop').props.accessibilityLabel).toBe('Close');
    await fireEvent.press(screen.getByTestId('pick-backdrop'));
    expect(screen.queryByTestId('pick-menu')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    await view.unmount();

    await renderWithProviders(<Menu onChange={onChange} locked />);
    await fireEvent.press(screen.getByTestId('pick-trigger'));
    await fireEvent.press(screen.getByTestId('pick-backdrop'));
    expect(screen.getByTestId('pick-menu')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pick-option-b'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('measures its trigger on the press and opens above it when it sits low on the screen', async () => {
    // 100 pt from the bottom of whatever screen the test runs on.
    const low = Dimensions.get('window').height - 100;
    MockNativeMethods.measureInWindow.mockImplementation((callback: (x: number, y: number, w: number, h: number) => void) =>
      callback(20, low, 120, 34),
    );
    await renderWithProviders(<Menu />);
    await fireEvent.press(screen.getByTestId('pick-trigger'));
    expect(MockNativeMethods.measureInWindow).toHaveBeenCalled();
    const panel = StyleSheet.flatten(screen.getByTestId('pick-menu').parent!.props.style);
    expect(panel.top).toBeUndefined();
    expect(typeof panel.bottom).toBe('number');
    expect(panel.left).toBe(20);
  });

  it('opens below a trigger high on the screen', async () => {
    MockNativeMethods.measureInWindow.mockImplementation((callback: (x: number, y: number, w: number, h: number) => void) =>
      callback(20, 100, 120, 34),
    );
    await renderWithProviders(<Menu />);
    await fireEvent.press(screen.getByTestId('pick-trigger'));
    const panel = StyleSheet.flatten(screen.getByTestId('pick-menu').parent!.props.style);
    expect(panel).toMatchObject({ top: 140, left: 20 });
    expect(panel.bottom).toBeUndefined();
  });
});

describe('links (A5): the router starts at the splash on a run or approval link, or stays when open; the app opens it', () => {
  it.each([
    ['https://app.autom8x.ai/runs/run-7?workspace=5d0f3a8e-2c41-4b7a-9e15-0a6c3f2b7d94', '/'],
    ['https://app.autom8x.ai/approvals/apr-1?workspace=5d0f3a8e-2c41-4b7a-9e15-0a6c3f2b7d94', '/'],
    ['/runs/run-7', '/'],
    ['/approvals/apr-1/', '/'],
    ['/auth/native/callback?code=abc&state=xyz', '/auth/native/callback?code=abc&state=xyz'],
    ['https://app.autom8x.ai/auth/native/callback?code=abc', 'https://app.autom8x.ai/auth/native/callback?code=abc'],
    ['/runs', '/runs'],
    ['/runs/a/b', '/runs/a/b'],
    ['/settings', '/settings'],
  ])('%s → %s', (path, to) => {
    expect(redirectSystemPath({ path, initial: true })).toBe(to);
  });

  it.each([
    ['https://app.autom8x.ai/runs/run-7?workspace=5d0f3a8e-2c41-4b7a-9e15-0a6c3f2b7d94', ''],
    ['/approvals/apr-1/', ''],
    ['/auth/native/callback?code=abc&state=xyz', '/auth/native/callback?code=abc&state=xyz'],
    ['/settings', '/settings'],
  ])('while the app is open: %s → %j (the open screen stays)', (path, to) => {
    expect(redirectSystemPath({ path, initial: false })).toBe(to);
  });

  const HOST = 'app.autom8x.ai';
  const WS = '5d0f3a8e-2c41-4b7a-9e15-0a6c3f2b7d94';

  it.each([
    [`https://${HOST}/runs/run-7?workspace=${WS}`, { target: { pathname: '/(tabs)/activity/run', params: { runId: 'run-7' } }, workspaceId: WS }],
    [`https://${HOST}/approvals/apr-1?workspace=${WS}`, { target: '/(tabs)/activity/approvals', workspaceId: WS }],
    [`https://${HOST}/runs/run-7`, { target: { pathname: '/(tabs)/activity/run', params: { runId: 'run-7' } }, workspaceId: undefined }],
    [`https://www.autom8x.ai/runs/run-7?workspace=${WS}`, null],
    [`http://${HOST}/runs/run-7`, null],
    [`https://${HOST}/runs/..%2Fsettings`, null],
    [`https://${HOST}/auth/native/callback?code=1`, null],
    ['not a url', null],
  ])('%s opens %j', (link, opened) => {
    expect(linkTargetOf(link, HOST)).toEqual(opened);
  });

  it('opens nothing without a link host (no release redirect configured)', () => {
    expect(linkTargetOf(`https://${HOST}/runs/run-7`, null)).toBeNull();
  });
});
