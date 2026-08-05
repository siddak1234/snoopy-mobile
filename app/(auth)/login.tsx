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
import { UserFocus } from 'phosphor-react-native';

import { BackCircle } from '@/components/nocturne/back-circle';
import { BrandMark } from '@/components/nocturne/brand-mark';
import { NocToggle } from '@/components/nocturne/noc-toggle';
import { OAuthButton } from '@/components/nocturne/oauth-button';
import { OrDivider } from '@/components/nocturne/or-divider';
import { PillButton } from '@/components/nocturne/pill-button';
import { TextField } from '@/components/nocturne/text-field';
import { em, fonts, layout } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();

  const [email, setEmail] = useState('alex@acme.co');
  const [password, setPassword] = useState('automate88');
  const [stayLoggedIn, setStayLoggedIn] = useState(true);

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
        <Text style={[styles.title, { color: palette.text }]}>Log in</Text>
        <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>
          Welcome back to your workspace.
        </Text>

        <View style={styles.form}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secure
            autoComplete="password"
          />
          <View style={styles.rememberRow}>
            <View style={styles.rememberLeft}>
              <NocToggle value={stayLoggedIn} onChange={setStayLoggedIn} />
              <Text style={[styles.rememberLabel, { color: palette.neutral[300] }]}>
                Stay logged in
              </Text>
            </View>
            <Text style={[styles.forgot, { color: palette.accentRamp[300] }]}>Forgot?</Text>
          </View>
          <PillButton label="Log In" onPress={() => router.replace('/(tabs)/(home)')} />
          <PillButton
            label="Unlock with Face ID"
            variant="accent-ghost"
            height={48}
            fontSize={15}
            icon={UserFocus}
            iconSize={21}
            gap={9}
            onPress={() => router.push('/(auth)/faceid')}
          />
        </View>

        <OrDivider />

        <View style={styles.oauthColumn}>
          <OAuthButton provider="apple" label="Continue with Apple" />
          <OAuthButton provider="google" label="Continue with Google" />
          <OAuthButton provider="microsoft" label="Continue with Microsoft" />
        </View>

        <Text style={[styles.switchLine, { color: palette.neutral[400] }]}>
          {'New here? '}
          <Text
            onPress={() => router.replace('/(auth)/signup')}
            style={{ fontFamily: fonts.medium, color: palette.accentRamp[300] }}>
            Sign up
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
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
    paddingHorizontal: 2,
  },
  rememberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rememberLabel: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
  },
  forgot: {
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  oauthColumn: {
    gap: 9,
  },
  switchLine: {
    marginTop: 20,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 13.5,
  },
});
