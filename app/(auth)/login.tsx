import React, { useEffect, useRef, useState } from 'react';
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
import * as LocalAuthentication from 'expo-local-authentication';
import { UserFocus, WarningCircle } from 'phosphor-react-native';

import { NocToggle } from '@/components/nocturne/noc-toggle';
import { BrandMark } from '@/components/nocturne/brand-mark';
import { OAuthButton } from '@/components/nocturne/oauth-button';
import { Skeleton } from '@/components/nocturne/skeleton';
import { OrDivider } from '@/components/nocturne/or-divider';
import { PillButton } from '@/components/nocturne/pill-button';
import { em, fonts, layout, radius, status, typeScale } from '@/constants/theme';
import { useBiometricWording } from '@/hooks/use-biometric-wording';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { useResource } from '@/hooks/use-resource';
import { readLoginProviders } from '@/lib/platform/auth';
import { readFaceIdChoice, readSession } from '@/lib/platform/session-store';
import type { LoginProvider } from '@/lib/platform/native-auth';

/**
 * Whether to ask the Face ID question after this sign-in: a remembered session,
 * a device with biometrics enrolled, and no answer recorded for this session.
 */
async function offersFaceId(remember: boolean): Promise<boolean> {
  if (!remember) return false;
  try {
    if ((await readFaceIdChoice()) !== 'unset') return false;
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    return hasHardware && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export default function LoginScreen() {
  const router = useRouter();
  const biometric = useBiometricWording();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const [signInError, setSignInError] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<LoginProvider | null>(null);
  const signInInFlight = useRef(false);
  const { signIn } = useSession();
  const providerPolicy = useResource(readLoginProviders, []);
  // Biometrics unlock a session this device already holds; they never mint one.
  // So the unlock is offered only when there is something to unlock — after a
  // sign-out or a fresh install there is not (24.7.3 attempt 2, feedback #10, #12).
  const [storedSession, setStoredSession] = useState<boolean | null>(null);
  // "Remember me", as every sign-in screen offers it (owner, 2026-10-02): on by
  // default; off means the session ends when the app is closed. The Face ID
  // question is asked only for a remembered session — there is nothing to
  // unlock otherwise.
  const [remember, setRemember] = useState(true);
  useEffect(() => {
    let cancelled = false;
    readSession()
      .then((stored) => {
        if (!cancelled) setStoredSession(stored !== null);
      })
      .catch(() => {
        if (!cancelled) setStoredSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The provider list is rendered as the platform sends it, `label` included.
  // Rebuilding the label from the id locally is the same shape as inventing a
  // filter vocabulary instead of using `categories`: the published field is
  // there, so the client uses it.
  const enabledProviders =
    providerPolicy.status === 'ready' ? providerPolicy.data.providers : [];
  const providerError =
    providerPolicy.status === 'offline'
      ? 'The platform is offline. Identity providers could not be loaded.'
      : providerPolicy.status === 'error' || providerPolicy.status === 'unconfigured'
        ? 'Identity providers are not available for this build.'
        : providerPolicy.status === 'ready' && providerPolicy.data.providers.length === 0
          ? 'This deployment has no identity provider enabled.'
          : null;
  const visibleError = signInError ?? providerError;
  // The provider read is a request, so it has a pending state. Without one the
  // only OAuth-capable half of the screen is simply missing while it resolves,
  // which reads as a broken build rather than as a screen still loading.
  const providersLoading = providerPolicy.status === 'loading';

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
      const outcome = await signIn(provider, { remember });
      if (outcome.status === 'signed-in') {
        router.replace((await offersFaceId(remember)) ? '/(auth)/faceid-offer' : '/(tabs)/(home)');
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
        {/* The mark and the title carry the screen; the subtitle went with the
            cover page, which already said what this is (owner, build 7; 24.11.6).
            One screen, the website's words: the provider creates the account on
            a first sign-in, so "Sign up" was the same action under another name
            (owner, 2026-10-02; 24.7.3 attempt 4). */}
        <BrandMark width={124} style={styles.brand} />
        <Text style={[styles.title, { color: palette.text }]}>Sign in</Text>

        {visibleError ? (
          <View style={styles.errorCallout}>
            <WarningCircle size={16} color={status.err} style={styles.errorIcon} />
            <Text style={styles.errorText}>
              {visibleError}
            </Text>
          </View>
        ) : null}

        {/* No email, no password, no "forgot": the platform refuses password
            login (`passwordLoginEnabled: false`) and the website shows providers
            only, so a form here taught people the product had a capability it
            refused — and was the one place a customer would type a password into
            this platform. Removed on the owner's direction, 2026-09-08 (platform
            manifest §12.1 #90). What remains is real: the native session unlock,
            and the identity providers the platform publishes. */}
        {storedSession ? (
          <View style={styles.form}>
            <PillButton
              label={biometric.unlockLabel}
              variant="accent-ghost"
              height={48}
              fontSize={typeScale.lead.fontSize}
              icon={UserFocus}
              iconSize={21}
              gap={9}
              onPress={() => router.push('/(auth)/faceid')}
            />
          </View>
        ) : null}

        {/* The divider separates the unlock from the providers; with no unlock
            above it, an "or" read as a missing control (24.7.3 attempt 4, #1). */}
        {storedSession && (enabledProviders.length > 0 || providersLoading) ? <OrDivider /> : null}

        <View style={[styles.oauthColumn, storedSession ? null : styles.oauthColumnAlone]}>
          {providersLoading
            ? [0, 1, 2].map((row) => (
                <Skeleton key={row} height={52} borderRadius={radius.pill} delay={row * 120} />
              ))
            : null}
          {enabledProviders.map(({ id, label }) => (
            <OAuthButton
              key={id}
              provider={id}
              label={`Sign in with ${label}`}
              disabled={busyProvider !== null}
              onPress={() => startSignIn(id as LoginProvider)}
            />
          ))}
        </View>

        <View style={[styles.rememberRow, { borderColor: palette.neutral[800] }]}>
          <View style={styles.rememberText}>
            <Text style={[styles.rememberTitle, { color: palette.text }]}>Remember me</Text>
            <Text style={[styles.rememberSub, { color: palette.neutral[400] }]}>
              {remember ? 'Stay signed in on this phone.' : 'Sign in again after closing the app.'}
            </Text>
          </View>
          <NocToggle value={remember} onChange={setRemember} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  brand: {
    marginTop: 26,
  },
  title: {
    marginTop: 22,
    fontFamily: fonts.medium,
    fontSize: typeScale.hero.fontSize,
    letterSpacing: em(-0.015, typeScale.hero.fontSize),
  },
  form: {
    marginTop: 44,
    gap: 14,
  },
  errorCallout: {
    marginTop: 24,
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
    ...typeScale.body,
    color: status.err,
  },
  oauthColumn: {
    gap: 9,
  },
  // With no unlock above them, the providers sit lower, under the title's air.
  oauthColumnAlone: {
    marginTop: 44,
  },
  rememberRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 14,
  },
  rememberText: { flex: 1, minWidth: 0, gap: 2 },
  rememberTitle: { fontFamily: fonts.medium, fontSize: typeScale.label.fontSize },
  rememberSub: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
});
