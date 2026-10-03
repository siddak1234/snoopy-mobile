import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import {
  Bell,
  Buildings,
  CaretRight,
  CreditCard,
  Lifebuoy,
  Palette,
  Plugs,
  ShieldCheck,
  SignOut,
  UserCircle,
  type Icon,
} from 'phosphor-react-native';
import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ActionFailure } from '@/components/screen-state';
import { SettingsRow } from '@/components/settings/settings-row';
import { em, fonts, layout, status, typeScale } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { SIGN_OUT_FAILED, SIGN_OUT_RETRY } from '@/lib/content/screen-states';

type CategoryPath =
  | '/(tabs)/settings/account'
  | '/(tabs)/settings/security'
  | '/(tabs)/settings/connections'
  | '/(tabs)/settings/billing'
  | '/(tabs)/settings/workspace'
  | '/(tabs)/settings/notifications'
  | '/(tabs)/settings/appearance'
  | '/(tabs)/settings/support';

/** The categories, in the owner's order (decision 10 of 2026-10-02, 24.12). Help is Support. */
const CATEGORIES: readonly { key: string; title: string; icon: Icon; path: CategoryPath }[] = [
  { key: 'account', title: 'Account', icon: UserCircle, path: '/(tabs)/settings/account' },
  { key: 'security', title: 'Security', icon: ShieldCheck, path: '/(tabs)/settings/security' },
  { key: 'connections', title: 'Connections', icon: Plugs, path: '/(tabs)/settings/connections' },
  { key: 'billing', title: 'Billing', icon: CreditCard, path: '/(tabs)/settings/billing' },
  { key: 'workspace', title: 'Workspace', icon: Buildings, path: '/(tabs)/settings/workspace' },
  { key: 'notifications', title: 'Notifications', icon: Bell, path: '/(tabs)/settings/notifications' },
  { key: 'appearance', title: 'Appearance', icon: Palette, path: '/(tabs)/settings/appearance' },
  { key: 'help', title: 'Help', icon: Lifebuoy, path: '/(tabs)/settings/support' },
];

/**
 * Settings (24.12, the owner's build 9: "a few main items then buttons that
 * you click and it takes you to a category specific page"): eight categories,
 * each its own page in this stack, then Sign out and the version. It reads
 * nothing — each page reads what it draws.
 */
export default function SettingsScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut } = useSession();
  const [signOutFailed, setSignOutFailed] = useState(false);
  const platformName = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'native';
  const appVersion = Constants.expoConfig?.version ?? '—';

  /**
   * Sign out for real, and honour the one answer the contract added for us.
   *
   * ADR-0017 §4 makes `POST /v1/auth/logout` answer **502** rather than 204 when
   * revocation fails, precisely so a client can tell. The session is still live
   * upstream at that point, so `signOut()` deliberately leaves the enclave
   * intact — and this screen must not navigate away claiming a sign-out that did
   * not happen. It says so inline instead and offers the action again.
   */
  const handleSignOut = async () => {
    const { revoked } = await signOut();
    if (!revoked) {
      setSignOutFailed(true);
      return;
    }
    setSignOutFailed(false);
    // Signed out is the cover (24.11.6); Sign in is one tap from it.
    router.replace('/');
  };

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}
      showsVerticalScrollIndicator={false}>
      <Text style={[styles.h1, { color: palette.text }]}>Settings</Text>

      <SurfaceCard>
        {CATEGORIES.map((category, index) => (
          <SettingsRow
            key={category.key}
            icon={category.icon}
            title={category.title}
            testID={`settings-${category.key}`}
            divider={index < CATEGORIES.length - 1}
            onPress={() => router.push(category.path)}
            right={<CaretRight size={15} color={palette.neutral[500]} />}
          />
        ))}
      </SurfaceCard>

      {signOutFailed ? (
        <ActionFailure
          message={SIGN_OUT_FAILED}
          retryLabel={SIGN_OUT_RETRY}
          onRetry={handleSignOut}
        />
      ) : null}

      <SurfaceCard onPress={handleSignOut} style={styles.signOutCard}>
        <SignOut size={20} color={status.err} />
        <Text style={[styles.signOutLabel, { color: status.err }]}>Sign out</Text>
      </SurfaceCard>

      <Text style={[styles.version, { color: palette.neutral[600] }]}>
        Autom8x for {platformName} · v{appVersion}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenX,
    paddingBottom: 20,
    gap: 16,
  },
  h1: {
    fontFamily: fonts.medium,
    fontSize: typeScale.display.fontSize,
    letterSpacing: em(-0.015, typeScale.display.fontSize),
  },
  signOutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: layout.rowPadH,
  },
  signOutLabel: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label.fontSize,
  },
  version: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: typeScale.caption.fontSize,
  },
});
