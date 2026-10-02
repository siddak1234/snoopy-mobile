import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PillButton } from '@/components/nocturne/pill-button';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Where a deleted account lands (BUILD-PLAN 24.6.2) — the website's
 * `/account-deleted`, in its words. Signed out: this device has already let go
 * of the session.
 */
export default function AccountDeletedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: palette.bg, paddingTop: insets.top + 40 }]}>
      <SurfaceCard style={styles.card}>
        <Text style={[styles.title, { color: palette.text }]}>Account deleted</Text>
        <Text style={[styles.text, { color: palette.neutral[400] }]}>
          Sorry to see you go. Your account and data have been permanently removed.
        </Text>
        <Text style={[styles.small, { color: palette.neutral[400] }]}>
          You can come back anytime — your first sign-in creates a new account.
        </Text>
        <PillButton label="Continue to Autom8x" variant="primary" height={46} onPress={() => router.replace('/(auth)/login')} />
      </SurfaceCard>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: layout.screenX },
  card: { padding: 22, gap: 12 },
  title: { fontFamily: fonts.medium, fontSize: 24, letterSpacing: em(-0.01, 24), textAlign: 'center' },
  text: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
