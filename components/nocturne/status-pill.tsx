import React from 'react';
import { Text, View } from 'react-native';

import { fonts, status, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { StatusPillLabel } from '@/lib/view/status';

/** Status pill (Live / Paused / Draft workflows; Held / Success / Failed /
 *  Running / Queued / Cancelled runs), colors from the design's pills +
 *  runDefs maps in Screen.dc.html. */
export function StatusPill({ label }: { label: StatusPillLabel }) {
  const { palette } = useTheme();
  // Neutral is spelled once and shared: the design gives Queued and Cancelled
  // Draft's exact treatment rather than a colour of their own.
  const neutral = {
    color: palette.neutral[400],
    bg: withAlpha(palette.neutral[500], 0.12),
    border: palette.neutral[700],
  } as const;
  const tones = {
    Live: { color: status.ok, bg: status.okBg, border: status.okBorder },
    Success: { color: status.ok, bg: status.okBg, border: status.okBorder },
    Paused: { color: status.warnText, bg: status.warnBg, border: status.warnBorder },
    Held: { color: status.warnText, bg: status.warnBg, border: status.warnBorder },
    Failed: { color: status.err, bg: status.errBg, border: status.errBorder },
    Draft: neutral,
    // The one state a person watches, so it takes the accent (runDefs.running).
    Running: {
      color: palette.accentRamp[300],
      bg: withAlpha(palette.accent, 0.12),
      border: palette.accentRamp[700],
    },
    Queued: neutral,
    Cancelled: neutral,
  } as const;
  const t = tones[label];
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: t.bg,
        borderWidth: 1,
        borderColor: t.border,
      }}>
      <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: t.color }}>{label}</Text>
    </View>
  );
}
