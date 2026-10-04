import * as Haptics from 'expo-haptics';
import React, { forwardRef } from 'react';
import { Platform, Pressable as NativePressable, type PressableProps, type View } from 'react-native';

/**
 * Every press ticks (the owner's build 10, item 10: "Ensure any button clicked
 * does haptic feedback like the others"; build 11, decision D7). "The others"
 * were the four tabs — the one haptic the app had, inside the tab bar — so this
 * is the place every press passes through: the selection tick the tabs give,
 * on iOS, before the handler runs.
 *
 * A press that does nothing gives none: no handler (the unswitchable workspace
 * pill, the signed-out cover), or a disabled control, which never fires its
 * handler. The native call can reject where the module is absent (expo-haptics'
 * `UnavailabilityError`, a rejection); a tick is never worth a failed press, so
 * the rejection is swallowed. Android is as it was — nothing; the app ships to
 * Apple first and no Android device is in the feedback loop.
 *
 * `audit:haptics` keeps this the only file that draws react-native's Pressable
 * or imports expo-haptics, and makes a host `Text`/`View` handler go through
 * `pressed()`. A behaviour wrapper, not a Nocturne primitive: the frozen 18
 * stay 18 and their snapshots unchanged, since the host tree is the same.
 */
export function pressed<E>(handler: ((event: E) => void) | null | undefined): ((event: E) => void) | undefined {
  if (!handler) return undefined;
  return (event) => {
    tick();
    handler(event);
  };
}

function tick(): void {
  if (Platform.OS !== 'ios') return;
  try {
    void Haptics.selectionAsync().catch(() => undefined);
  } catch {
    // A module missing at call time throws synchronously on some builds; the press still runs.
  }
}

/** React Native's Pressable, every prop passed through, its press ticking. */
export const Pressable = forwardRef<View, PressableProps>(function Pressable({ onPress, ...rest }, ref) {
  return <NativePressable ref={ref} {...rest} onPress={pressed(onPress)} />;
});

export var ciWave1DeliberateFailure = 1;
