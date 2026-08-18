import React, { useRef, useState } from 'react';
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
import { useResource } from '@/hooks/use-resource';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { readLoginProviders } from '@/lib/platform/auth';
import type { LoginProvider } from '@/lib/platform/native-auth';

export default function SignupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { signIn } = useSession();
  const providerPolicy = useResource(readLoginProviders, []);
  const [message, setMessage] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<LoginProvider | null>(null);
  const signInInFlight = useRef(false);
  const providerError =
    providerPolicy.status === 'offline'
      ? 'The platform is offline. Identity providers could not be loaded.'
      : providerPolicy.status === 'error' || providerPolicy.status === 'unconfigured'
        ? 'Identity providers are not available for this build.'
        : null;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const manualSignupUnavailable = () => {
    setMessage('Accounts are created through Apple, Google, or Microsoft.');
  };

  const startSignUp = async (provider: LoginProvider) => {
    if (signInInFlight.current) return;
    signInInFlight.current = true;
    setMessage(null);
    setBusyProvider(provider);
    try {
      const outcome = await signIn(provider);
      if (outcome.status === 'signed-in') router.push('/(auth)/onboarding');
      else if (outcome.status !== 'cancelled') setMessage(outcome.message);
    } finally {
      signInInFlight.current = false;
      setBusyProvider(null);
    }
  };

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
          <PillButton label="Create account" onPress={manualSignupUnavailable} />
        </View>

        {message ?? providerError ? (
          <Text style={[styles.message, { color: palette.neutral[400] }]}>
            {message ?? providerError}
          </Text>
        ) : null}

        {/* See login.tsx: no divider above an empty provider column. */}
        {providerPolicy.status === 'ready' && providerPolicy.data.providers.length > 0 ? (
          <OrDivider />
        ) : null}

        <View style={styles.oauthColumn}>
          {providerPolicy.status === 'ready'
            ? providerPolicy.data.providers.map(({ id, label }) => (
                <OAuthButton
                  key={id}
                  provider={id}
                  label={`Sign up with ${label}`}
                  disabled={busyProvider !== null}
                  onPress={() => startSignUp(id)}
                />
              ))
            : null}
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
  message: {
    marginTop: 12,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 12.5,
  },
  legal: {
    marginTop: 18,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 11.5,
    lineHeight: 17.25,
  },
});
