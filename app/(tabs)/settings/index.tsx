import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import {
  Archive,
  Bell,
  Buildings,
  CaretRight,
  CreditCard,
  DownloadSimple,
  IdentificationBadge,
  Lifebuoy,
  Plugs,
  SignOut,
  UserCircle,
  Users,
  UsersThree,
} from 'phosphor-react-native';
import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Pressable } from '@/components/pressable';
import { ActionFailure } from '@/components/screen-state';
import { FaceIdRow } from '@/components/settings/face-id-row';
import { SettingsRow } from '@/components/settings/settings-row';
import { WorkspaceSwitcher } from '@/components/settings/workspace-switcher';
import { em, fonts, layout, typeScale } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useSession } from '@/hooks/use-session';
import { useTheme, type ThemeMode } from '@/hooks/use-theme';
import { SIGN_OUT_FAILED, SIGN_OUT_RETRY } from '@/lib/content/screen-states';
import { readBilling } from '@/lib/platform/billing';
import { enrolledPlanName } from '@/lib/view/billing';
import { organizationValue } from '@/lib/view/organization';
import { administers } from '@/lib/view/roles';

/** The theme's three options, in the owner's order (build 10, item 1: "auto, dark, or light"). */
const APPEARANCE: { label: string; mode: ThemeMode }[] = [
  { label: 'Auto', mode: 'auto' },
  { label: 'Dark', mode: 'dark' },
  { label: 'Light', mode: 'light' },
];

/** Under Billing's title for a member, whose workspace's billing is never read (the Edge refuses it). */
const BILLING_MANAGED_BY = 'Managed by owners and admins';

/**
 * Settings (build 11, D1 — the owner's build 10 items 1, 2 and 4: "I didnt
 * want all to be like this… they look swished together… Security does not
 * need its own page… This can also be in the main settings page"): ONE grouped
 * page, in the build's order. The large areas — Account, Connections, Billing,
 * Notifications, Help — are rows that open their pages; the small things sit
 * here, under their labels, as the build 9 screen had them: the Face ID row,
 * the six workspace rows with the switcher, and the theme control. Each row
 * carries its detail: the account's email under it; the plan's name and the
 * organization's on the right, before the arrow (the owner's build 12 items 2
 * and 3), as the workspace's type and the role are.
 *
 * It reads only the plan, quietly: an owner's or admin's billing through the
 * shared snapshot (one request per workspace per window), said once it is
 * known — nothing while loading, nothing on a failure or offline, since a
 * wrong plan name is worse than none; a member's is never read. Everything
 * else here is the session's — the organization's name included — and the
 * switcher reads the workspace collection only when it opens. The rows are
 * roomier than every other list's (`size`).
 */
export default function SettingsScreen() {
  const { palette, mode, setMode } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const { signOut } = session;
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const platformName = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'native';
  const appVersion = Constants.expoConfig?.version ?? '—';

  const currentSession = session.status === 'signed-in' ? session.session : null;
  const activeWorkspace =
    currentSession?.workspaces.find((workspace) => workspace.id === currentSession.user.activeWorkspaceId) ??
    currentSession?.workspaces[0];
  // The role from the session's own membership: no workspace read for it.
  const canAdminister = administers(activeWorkspace?.role);

  /**
   * Hidden below two workspaces, as the web switcher is — unless the session
   * says its list is truncated, in which case the collection may hold more and
   * only reading it can say. The trigger is the design's own WORKSPACE row.
   */
  const canSwitchWorkspace =
    currentSession !== null &&
    (currentSession.workspaces.length >= 2 || currentSession.workspacesTruncated === true);

  // The plan's name, Billing's value: read for an owner or admin only, and only
  // ever shown as a name the platform answered. A member's read would be
  // refused, so it is not made; their line under the title says who manages it.
  const billing = useWorkspaceResource(
    async (workspaceId) => (canAdminister ? readBilling(workspaceId) : null),
    [canAdminister],
  );
  const planName =
    canAdminister && billing.status === 'ready' && billing.data ? enrolledPlanName(billing.data) : undefined;
  // The organization's name, from the session's own list: no request for it.
  const organization = currentSession
    ? organizationValue(currentSession.workspaces, activeWorkspace, currentSession.workspacesTruncated)
    : undefined;

  /**
   * Sign out for real, and honour the one answer the contract added for us.
   *
   * ADR-0017 §4 makes `POST /v1/auth/logout` answer **502** rather than 204 when
   * revocation fails, precisely so a client can tell. The session is still live
   * upstream at that point, so `signOut()` deliberately leaves the enclave
   * intact — and this screen must not claim a sign-out that did not happen. It
   * says so inline instead and offers the action again.
   *
   * Signed out, the root layout's guard takes the tabs away and shows the cover
   * (24.11.6). Nothing navigates from here: inside the tabs "/" is Home, and
   * build 12's move to it was dropped (the owner's build 12 item 6).
   */
  const handleSignOut = async () => {
    const { revoked } = await signOut();
    setSignOutFailed(!revoked);
  };

  const caret = <CaretRight size={15} color={palette.neutral[500]} />;
  const muted = { color: palette.neutral[500] };

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}
      showsVerticalScrollIndicator={false}>
      <Text style={[styles.h1, { color: palette.text }]}>Settings</Text>

      {/* The account itself: linked sign-in accounts, and deleting it (24.6.2); its email under it. */}
      <SurfaceCard>
        <SettingsRow
          icon={UserCircle}
          title="Account"
          sub={currentSession?.user.email}
          size="roomy"
          testID="settings-account"
          onPress={() => router.push('/(tabs)/settings/account')}
          right={caret}
        />
      </SurfaceCard>

      <View>
        <SectionLabel>SECURITY</SectionLabel>
        <FaceIdRow size="roomy" testID="settings-face-id" />
      </View>

      <SurfaceCard>
        {/* Third-party integrations only (24.12, decision 9); sign-in accounts are Account's. */}
        <SettingsRow
          icon={Plugs}
          title="Connections"
          divider
          size="roomy"
          testID="settings-connections"
          onPress={() => router.push('/(tabs)/settings/connections')}
          right={caret}
        />
        <SettingsRow
          icon={CreditCard}
          title="Billing"
          sub={canAdminister ? undefined : BILLING_MANAGED_BY}
          value={planName}
          size="roomy"
          testID="settings-billing"
          onPress={() => router.push('/(tabs)/settings/billing')}
          right={caret}
        />
      </SurfaceCard>

      <View>
        <SectionLabel>WORKSPACE</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          <SettingsRow
            icon={Buildings}
            title={activeWorkspace?.name ?? 'Workspace'}
            divider
            size="roomy"
            testID="workspace-switcher-row"
            onPress={canSwitchWorkspace ? () => setSwitcherOpen(true) : undefined}
            right={
              canSwitchWorkspace ? (
                <View style={styles.right}>
                  <Text style={[styles.value, muted]}>{activeWorkspace?.type ?? ''}</Text>
                  <CaretRight size={15} color={palette.neutral[500]} testID="workspace-switcher-caret" />
                </View>
              ) : (
                <Text style={[styles.value, muted]}>{activeWorkspace?.type ?? ''}</Text>
              )
            }
          />
          <SettingsRow
            icon={Users}
            title="Your role"
            divider
            size="roomy"
            testID="settings-role"
            right={<Text style={[styles.value, muted]}>{activeWorkspace?.role ?? '—'}</Text>}
          />
          {/* The admin areas the website keeps under /account (ADR-0032, 24.5).
              Teams are every workspace's: in an organization, and the person's own (24.11.7). */}
          <SettingsRow
            icon={IdentificationBadge}
            title="Organization"
            value={organization}
            divider
            size="roomy"
            testID="settings-organization"
            onPress={() => router.push('/(tabs)/settings/organization')}
            right={caret}
          />
          <SettingsRow
            icon={UsersThree}
            title="Teams"
            sub="Your teams, who is on them, and asking to join one"
            divider
            size="roomy"
            testID="settings-teams"
            onPress={() => router.push('/(tabs)/settings/teams')}
            right={caret}
          />
          <SettingsRow
            icon={Archive}
            title="Archived flows"
            sub="Kept with their history; add any again"
            divider
            size="roomy"
            testID="settings-archived-flows"
            // The Settings stack's own copy, so Back returns here (the owner's build 9).
            onPress={() => router.push('/(tabs)/settings/archived')}
            right={caret}
          />
          <SettingsRow
            icon={DownloadSimple}
            title="Export my data"
            sub="A copy of this workspace's records, as a file"
            size="roomy"
            testID="settings-data"
            onPress={() => router.push('/(tabs)/settings/data')}
            right={caret}
          />
        </SurfaceCard>
      </View>

      {/* The inbox itself, in this stack, so Back returns here (24.12). */}
      <SurfaceCard>
        <SettingsRow
          icon={Bell}
          title="Notifications"
          size="roomy"
          testID="settings-notifications"
          onPress={() => router.push('/(tabs)/settings/notifications')}
          right={caret}
        />
      </SurfaceCard>

      <View>
        <SectionLabel>APPEARANCE</SectionLabel>
        <SurfaceCard style={styles.segCard}>
          <View style={styles.segRow} testID="settings-appearance">
            {APPEARANCE.map((opt) => {
              const active = mode === opt.mode;
              return (
                <Pressable
                  key={opt.mode}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setMode(opt.mode)}
                  style={[styles.segOpt, active && { borderWidth: 1, borderColor: palette.accent }]}>
                  <Text
                    style={{
                      fontFamily: active ? fonts.medium : fonts.regular,
                      fontSize: typeScale.body.fontSize,
                      color: active ? palette.accent : palette.neutral[400],
                    }}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </SurfaceCard>
      </View>

      <SurfaceCard>
        <SettingsRow
          icon={Lifebuoy}
          title="Help"
          sub="Contact us, privacy and terms"
          size="roomy"
          testID="settings-help"
          onPress={() => router.push('/(tabs)/settings/support')}
          right={caret}
        />
      </SurfaceCard>

      {signOutFailed ? (
        <ActionFailure
          message={SIGN_OUT_FAILED}
          retryLabel={SIGN_OUT_RETRY}
          onRetry={handleSignOut}
        />
      ) : null}

      <SurfaceCard onPress={handleSignOut} style={styles.signOutCard}>
        <SignOut size={20} color={palette.danger} />
        <Text style={[styles.signOutLabel, { color: palette.danger }]}>Sign out</Text>
      </SurfaceCard>

      <Text style={[styles.version, { color: palette.neutral[600] }]}>
        Autom8x for {platformName} · v{appVersion}
      </Text>

      <WorkspaceSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
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
  // Each labelled card sits 9 under its label.
  sectionCard: {
    marginTop: 9,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  value: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  segCard: {
    marginTop: 9,
    padding: 6,
  },
  segRow: {
    flexDirection: 'row',
    gap: 4,
  },
  segOpt: {
    flex: 1,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: layout.rowPadVRoomy,
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
