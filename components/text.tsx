import React from 'react';
// The one place react-native's text components are imported (`audit:type`).
import { Text as NativeText, TextInput as NativeTextInput } from 'react-native';

import { fontScaleLimit } from '@/constants/theme';

/**
 * The app's `Text` and `TextInput` (round 24 P3; the owner's build 23 F14):
 * react-native's, every prop forwarded, following the phone's text size up to
 * `fontScaleLimit.content` (2×) unless the caller says otherwise — text in a
 * fixed bar passes `maxFontSizeMultiplier={fontScaleLimit.chrome}`. React 19
 * gives function components no `defaultProps`, so a wrapper is the only single
 * place for the limit; `audit:type` fails `Text` or `TextInput` imported from
 * react-native anywhere else.
 */
export function Text(props: React.ComponentPropsWithRef<typeof NativeText>) {
  return <NativeText maxFontSizeMultiplier={fontScaleLimit.content} {...props} />;
}

export function TextInput(props: React.ComponentPropsWithRef<typeof NativeTextInput>) {
  return <NativeTextInput maxFontSizeMultiplier={fontScaleLimit.content} {...props} />;
}
