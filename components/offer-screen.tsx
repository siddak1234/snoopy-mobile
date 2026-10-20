import type { Icon } from 'phosphor-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PillButton } from '@/components/nocturne/pill-button';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Text } from '@/components/text';
import { em, fonts, layout, status, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The one-time question after a sign-in, as one layout (round 24 P8: the owner's
 * build 23 F6, "Just like that it should be notifications allow"): a card with
 * the question's glyph in its tile, the question, one line, what went wrong if
 * anything did, and the answer then Not now. The Face ID offer and the
 * notifications offer draw it, so the second is "just like" the first by
 * construction — extracted from `app/(auth)/faceid-offer.tsx`, not copied.
 */
export function OfferScreen({
  icon: Glyph,
  title,
  body,
  message,
  accept,
  decline,
  busy,
  testID,
}: {
  icon: Icon;
  title: string;
  body: string;
  message?: string | null;
  accept: { label: string; onPress: () => void };
  decline: { label: string; onPress: () => void };
  busy: boolean;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.screen,
        { backgroundColor: palette.bg, paddingTop: insets.top + (layout.designTop.auth - layout.statusArea) },
      ]}>
      <SurfaceCard style={styles.card}>
        <View style={[styles.glyph, { borderColor: palette.accentRamp[700] }]}>
          <Glyph size={28} color={palette.accentRamp[300]} />
        </View>
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.body, { color: palette.neutral[400] }]}>{body}</Text>
        {message ? <Text style={[styles.message, { color: status.err }]}>{message}</Text> : null}
        <View style={styles.actions}>
          <PillButton
            label={accept.label}
            variant="primary"
            height={48}
            fontSize={typeScale.lead.fontSize}
            disabled={busy}
            onPress={accept.onPress}
            style={styles.action}
          />
          <PillButton
            label={decline.label}
            variant="plain"
            height={44}
            fontSize={typeScale.label.fontSize}
            disabled={busy}
            onPress={decline.onPress}
          />
        </View>
      </SurfaceCard>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: layout.authX },
  card: { padding: 22, alignItems: 'center', gap: 10 },
  glyph: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontFamily: fonts.medium, fontSize: typeScale.title.fontSize, letterSpacing: em(-0.01, typeScale.title.fontSize), textAlign: 'center' },
  body: { fontFamily: fonts.regular, ...typeScale.label, textAlign: 'center' },
  message: { fontFamily: fonts.regular, fontSize: typeScale.body.fontSize, textAlign: 'center' },
  actions: { alignSelf: 'stretch', marginTop: 8, gap: 6 },
  action: { alignSelf: 'stretch' },
});
