import React from 'react';
import { Platform, Pressable as NativePressable, Text } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';

import { Pressable, pressed } from '@/components/pressable';
import { renderWithProviders } from '@/test/render';

const Haptics = jest.requireMock('expo-haptics');

/**
 * The shared pressable (build 11, D7; the owner's build 10 item 10: "Ensure
 * any button clicked does haptic feedback like the others"): every press
 * ticks, through this one helper; a press that does nothing gives none.
 */
describe('the shared pressable', () => {
  it('ticks once, then calls the handler with its event', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <Pressable onPress={onPress}>
        <Text>Go</Text>
      </Pressable>,
    );
    const event = { nativeEvent: { locationX: 1 } };
    await fireEvent.press(screen.getByText('Go'), event);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
    // RNTL fills the event in; what was sent is in it, untouched.
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ nativeEvent: expect.objectContaining({ locationX: 1 }) }));
  });

  it('gives no tick with no handler: a press that does nothing', async () => {
    await renderWithProviders(
      <Pressable>
        <Text>Inert</Text>
      </Pressable>,
    );
    await fireEvent.press(screen.getByText('Inert'));
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('gives no tick when disabled, since the handler never fires', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <Pressable disabled onPress={onPress}>
        <Text>Disabled</Text>
      </Pressable>,
    );
    await fireEvent.press(screen.getByText('Disabled'));
    expect(onPress).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it("pressed() wraps a host element's handler the same way, and is nothing for no handler", () => {
    expect(pressed(undefined)).toBeUndefined();
    expect(pressed(null)).toBeUndefined();
    const handler = jest.fn();
    const wrapped = pressed(handler)!;
    wrapped('event');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('event');
  });

  it('still runs the handler when the native call rejects or throws — a tick is never worth a failed press', async () => {
    Haptics.selectionAsync.mockRejectedValueOnce(new Error('UnavailabilityError'));
    const handler = jest.fn();
    expect(() => pressed(handler)!(undefined)).not.toThrow();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);

    Haptics.selectionAsync.mockImplementationOnce(() => {
      throw new Error('no native module');
    });
    expect(() => pressed(handler)!(undefined)).not.toThrow();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('is silent on Android, as the tab bar always was', () => {
    const android = jest.replaceProperty(Platform, 'OS', 'android');
    const handler = jest.fn();
    pressed(handler)!(undefined);
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
    android.restore();
  });

  it("passes every prop through: the host tree is react-native's own, so no snapshot moves", async () => {
    const props = {
      accessibilityRole: 'button' as const,
      accessibilityLabel: 'Open',
      testID: 'open',
      hitSlop: 8,
      style: { padding: 4 },
    };
    const ours = await renderWithProviders(
      <Pressable {...props} onPress={() => undefined}>
        <Text>Open</Text>
      </Pressable>,
    );
    const native = await renderWithProviders(
      <NativePressable {...props} onPress={() => undefined}>
        <Text>Open</Text>
      </NativePressable>,
    );
    expect(JSON.stringify(ours.toJSON())).toBe(JSON.stringify(native.toJSON()));
  });
});
