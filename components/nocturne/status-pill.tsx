import React from 'react';
import { Text, View } from 'react-native';

import { fonts, status, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { FlowStatus } from '@/lib/fixtures';

/** Status pill (Live / Paused / Draft workflows; Held / Success / Failed
 *  runs), colors from the design's pills + runDefs maps in Screen.dc.html. */
export function StatusPill({ label }: { label: FlowStatus | 'Held' | 'Success' | 'Failed' }) {
  const { palette } = useTheme();
  const tones = {
    Live: { color: status.ok, bg: status.okBg, border: status.okBorder },
    Success: { color: status.ok, bg: status.okBg, border: status.okBorder },
    Paused: { color: status.warnText, bg: status.warnBg, border: status.warnBorder },
    Held: { color: status.warnText, bg: status.warnBg, border: status.warnBorder },
    Failed: { color: status.err, bg: status.errBg, border: status.errBorder },
    Draft: {
      color: palette.neutral[400],
      bg: withAlpha(palette.neutral[500], 0.12),
      border: palette.neutral[700],
    },
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
