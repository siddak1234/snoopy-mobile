import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PillButton } from '@/components/nocturne/pill-button';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { websiteOrigin } from '@/lib/platform/native-auth';

/**
 * Where a deleted account lands (BUILD-PLAN 24.6.2) — the website's
 * `/account-deleted`, in its words. Signed out: this device has already let go
 * of the session, so "Continue" is the cover (24.11.6).
 *
 * It says only what deletion did: the account, the personal workspace and the
 * organizations the person alone owned. What deletion leaves (backups, the
 * file records, the sign-in record) is the Privacy Policy's to say, so the
 * screen links there rather than promising everything is gone (backend 25.7.4).
 */
export default function AccountDeletedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const site = websiteOrigin();
  return (
    <View style={[styles.root, { backgroundColor: palette.bg, paddingTop: insets.top + 40 }]}>
      <SurfaceCard style={styles.card}>
        <Text style={[styles.title, { color: palette.text }]}>Account deleted</Text>
        <Text style={[styles.text, { color: palette.neutral[400] }]}>
          Sorry to see you go. Your account, your personal workspace and every organization you alone owned have been
          deleted. Our{' '}
          {site ? (
            <Text
              style={styles.link}
              accessibilityRole="link"
              testID="account-deleted-privacy"
              onPress={() => void Linking.openURL(`${site}/privacy`)}>
              Privacy Policy
            </Text>
          ) : (
            'Privacy Policy'
          )}{' '}
          says what deletion does not remove.
        </Text>
        <Text style={[styles.small, { color: palette.neutral[400] }]}>You can come back anytime with a new account.</Text>
        <PillButton label="Continue to Autom8x" variant="primary" height={46} onPress={() => router.replace('/')} />
      </SurfaceCard>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: layout.screenX },
  card: { padding: 22, gap: 12 },
  title: { fontFamily: fonts.medium, fontSize: typeScale.display.fontSize, letterSpacing: em(-0.01, typeScale.display.fontSize), textAlign: 'center' },
  text: { fontFamily: fonts.regular, ...typeScale.label, textAlign: 'center' },
  small: { fontFamily: fonts.regular, ...typeScale.body, textAlign: 'center' },
  link: { textDecorationLine: 'underline' },
});
