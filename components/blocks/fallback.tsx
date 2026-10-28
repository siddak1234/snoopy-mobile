import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';

import { Text } from '@/components/text';
import { fonts, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { FALLBACK } from '@/lib/content/screen-states';

import { notDrawn } from './not-drawn';

/**
 * The one sentence for a part this build cannot draw (backend ADR-0048
 * decision 10): an unknown block, form or page part, at the top level or inside
 * a section, and a page whose blocks did not come (`FALLBACK`). Drawn bare only
 * by `Catch`, which logs the caught error itself; every other fallback is
 * `NotDrawnFallback`.
 */
export function Fallback({ testID = 'block-fallback' }: { testID?: string }) {
  const { palette } = useTheme();
  return (
    <Text testID={testID} style={[styles.line, { color: palette.neutral[400] }]}>
      {FALLBACK}
    </Text>
  );
}

/**
 * A part not drawn without a throw (round 21, design D2.6: every fallback is
 * logged): `Fallback` in its place, and one log line naming its type and why
 * (`notDrawn`) — a known block's missing field, `unknown type`, a body that is
 * `no blocks` or `not a list`, a form this build does not know (`form.kind`),
 * an image whose target has no reader or page (`open.target`), a group entry
 * that is not a section (`sections[n].type`) — never its values. Logged once
 * per change, not on every re-read.
 */
export function NotDrawnFallback({ type, error, testID }: { type: string; error: string; testID: string }) {
  useEffect(() => notDrawn(type, error), [type, error]);
  return <Fallback testID={testID} />;
}

const styles = StyleSheet.create({
  line: { fontFamily: fonts.regular, ...typeScale.small },
});
