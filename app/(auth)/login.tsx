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
import { UserFocus, WarningCircle } from 'phosphor-react-native';

import { BackCircle } from '@/components/nocturne/back-circle';
import { BrandMark } from '@/components/nocturne/brand-mark';
import { NocToggle } from '@/components/nocturne/noc-toggle';
import { OAuthButton } from '@/components/nocturne/oauth-button';
import { OrDivider } from '@/components/nocturne/or-divider';
import { PillButton } from '@/components/nocturne/pill-button';
import { TextField } from '@/components/nocturne/text-field';
import { em, fonts, layout, status } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { useResource } from '@/hooks/use-resource';
import { readLoginProviders } from '@/lib/platform/auth';
import type { LoginProvider } from '@/lib/platform/native-auth';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signInError, setSignInError] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<LoginProvider | null>(null);
  const signInInFlight = useRef(false);
  const { signIn } = useSession();
  const providerPolicy = useResource(readLoginProviders, []);

  // The provider list is rendered as the platform sends it, `label` included.
  // Rebuilding the label from the id locally is the same shape as inventing a
  // filter vocabulary instead of using `categories`: the published field is
  // there, so the client uses it. `app/(auth)/signup.tsx` already did.
  const enabledProviders =
    providerPolicy.status === 'ready' ? providerPolicy.data.providers : [];
  const providerError =
    providerPolicy.status === 'offline'
      ? 'The platform is offline. Identity providers could not be loaded.'
      : providerPolicy.status === 'error' || providerPolicy.status === 'unconfigured'
        ? 'Identity providers are not available for this build.'
        : null;
  const visibleError = signInError ?? providerError;

  const manualLoginUnavailable = () => {
    setSignInError('Password login is not available. Continue with an identity provider below.');
  };

  /**
   * Sign in through the system browser (ADR-0017).
   *
   * A cancelled sheet clears the callout rather than reporting anything — the
   * person closed it on purpose. Only a real refusal is worth a message, and it
   * renders in the callout the design already draws.
   */
  const startSignIn = async (provider: LoginProvider) => {
    if (signInInFlight.current) return;
    signInInFlight.current = true;
    setSignInError(null);
    setBusyProvider(provider);
    try {
      const outcome = await signIn(provider);
      if (outcome.status === 'signed-in') {
        router.replace('/(tabs)/(home)');
        return;
      }
      if (outcome.status === 'cancelled') return;
      setSignInError(outcome.message);
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
        <Text style={[styles.title, { color: palette.text }]}>Log in</Text>
        <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>
          Welcome back to your workspace.
        </Text>

        {visibleError ? (
          <View style={styles.errorCallout}>
            <WarningCircle size={16} color={status.err} style={styles.errorIcon} />
            <Text style={styles.errorText}>
              {visibleError}
            </Text>
          </View>
        ) : null}

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
              <NocToggle value onChange={() => {}} disabled />
              <Text style={[styles.rememberLabel, { color: palette.neutral[300] }]}>
                Stay logged in
              </Text>
            </View>
            <Text
              onPress={() => router.push('/(auth)/reset')}
              suppressHighlighting
              style={[styles.forgot, { color: palette.accentRamp[300] }]}>
              Forgot?
            </Text>
          </View>
          <PillButton label="Log In" onPress={manualLoginUnavailable} />
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

        {/* No divider above an empty column: when the provider read fails or
            the build is unconfigured there is nothing to separate, and an "or"
            with nothing under it reads as a missing control rather than as the
            honest refusal already shown in the callout above. */}
        {enabledProviders.length > 0 ? <OrDivider /> : null}

        <View style={styles.oauthColumn}>
          {enabledProviders.map(({ id, label }) => (
            <OAuthButton
              key={id}
              provider={id}
              label={`Continue with ${label}`}
              disabled={busyProvider !== null}
              onPress={() => startSignIn(id as LoginProvider)}
            />
          ))}
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
  errorCallout: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: status.errCalloutBg,
    borderWidth: 1,
    borderColor: status.errCalloutBorder,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  errorIcon: {
    marginTop: 1,
  },
  errorText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 13 * 1.45,
    color: status.err,
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
