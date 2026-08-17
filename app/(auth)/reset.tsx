import { useRouter } from 'expo-router';
import { PaperPlaneTilt } from 'phosphor-react-native';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { BrandMark } from '@/components/nocturne/brand-mark';
import { PillButton } from '@/components/nocturne/pill-button';
import { TextField } from '@/components/nocturne/text-field';
import { em, fonts, layout, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Password reset (design `sReset`): form → "Link sent" confirmation. */
export default function ResetPasswordScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + (layout.designTop.auth - layout.statusArea),
          paddingHorizontal: layout.authX,
          paddingBottom: 40,
        }}>
        <BackCircle onPress={() => router.back()} />
        <BrandMark width={86} style={styles.brand} />
        <Text style={[styles.title, { color: palette.text }]}>Reset password</Text>

        {sent ? (
          <View
            style={[
              styles.sentCard,
              {
                borderColor: palette.accentRamp[700],
                backgroundColor: withAlpha(palette.accent, 0.08),
              },
            ]}>
            <PaperPlaneTilt size={38} color={palette.accentRamp[300]} />
            <Text style={[styles.sentTitle, { color: palette.text }]}>Link sent</Text>
            <Text style={[styles.sentBody, { color: palette.neutral[400] }]}>
              Check {email} — the link expires in 30 minutes. Nothing arriving? Check spam or
              resend.
            </Text>
            <PillButton
              label="Back to log in"
              variant="primary"
              height={44}
              fontSize={14}
              onPress={() => router.replace('/(auth)/login')}
              style={styles.sentCta}
            />
          </View>
        ) : (
          <>
            <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>
              Enter your email and we&apos;ll send a reset link.
            </Text>
            <View style={styles.form}>
              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoComplete="email"
              />
              <PillButton label="Send reset link" onPress={() => setSent(true)} />
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  brand: {
    marginTop: 26,
  },
  title: {
    marginTop: 14,
    fontFamily: fonts.medium,
    fontSize: 28,
    letterSpacing: em(-0.015, 28),
  },
  subtitle: {
    marginTop: 6,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 14 * 1.5,
  },
  form: {
    marginTop: 26,
    gap: 14,
  },
  sentCard: {
    marginTop: 32,
    alignItems: 'center',
    gap: 14,
    paddingVertical: 30,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  sentTitle: {
    fontFamily: fonts.medium,
    fontSize: 17,
  },
  sentBody: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.55,
    textAlign: 'center',
  },
  sentCta: {
    marginTop: 4,
    paddingHorizontal: 24,
  },
});
