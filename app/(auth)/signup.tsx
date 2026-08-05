import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { BrandMark } from '@/components/nocturne/brand-mark';
import { OAuthButton } from '@/components/nocturne/oauth-button';
import { OrDivider } from '@/components/nocturne/or-divider';
import { PillButton } from '@/components/nocturne/pill-button';
import { TextField } from '@/components/nocturne/text-field';
import { em, fonts, layout } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function SignupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
        <Text style={[styles.title, { color: palette.text }]}>Create your account</Text>
        <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>
          Start automating in minutes.
        </Text>

        <View style={styles.form}>
          <TextField
            label="Full name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Alex Kim"
            autoComplete="name"
          />
          <TextField
            label="Work email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@company.com"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="8+ characters"
            secure
            autoComplete="new-password"
          />
          <PillButton label="Create account" onPress={() => router.push('/(auth)/onboarding')} />
        </View>

        <OrDivider />

        <View style={styles.oauthColumn}>
          <OAuthButton provider="apple" label="Sign up with Apple" />
          <OAuthButton provider="google" label="Sign up with Google" />
          <OAuthButton provider="microsoft" label="Sign up with Microsoft" />
        </View>

        <Text style={[styles.legal, { color: palette.neutral[600] }]}>
          {'By continuing you agree to the Terms of Service\nand Privacy Policy. Have an account? '}
          <Text
            onPress={() => router.replace('/(auth)/login')}
            style={{ color: palette.accentRamp[300] }}>
            Log in
          </Text>
        </Text>
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
  },
  form: {
    marginTop: 26,
    gap: 14,
  },
  oauthColumn: {
    gap: 9,
  },
  legal: {
    marginTop: 18,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 11.5,
    lineHeight: 17.25,
  },
});
