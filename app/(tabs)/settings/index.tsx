import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  Bell,
  Buildings,
  CaretRight,
  CreditCard,
  CrownSimple,
  DownloadSimple,
  FolderSimple,
  IdentificationBadge,
  Lifebuoy,
  SignOut,
  Storefront,
  UserFocus,
  Users,
  UsersThree,
} from 'phosphor-react-native';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarBadge } from '@/components/nocturne/avatar-badge';
import { NocToggle } from '@/components/nocturne/noc-toggle';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ActionFailure, ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { ConnectionsCard } from '@/components/settings/connections-card';
import { SettingsRow } from '@/components/settings/settings-row';
import { WorkspaceSwitcher } from '@/components/settings/workspace-switcher';
import { em, fonts, layout, status } from '@/constants/theme';
import { useWorkspaceResource, busyBody } from '@/hooks/use-resource';
import { useBiometricWording } from '@/hooks/use-biometric-wording';
import { useSession } from '@/hooks/use-session';
import { useSolutions } from '@/hooks/use-solutions';
import { useTheme, type ThemeMode } from '@/hooks/use-theme';
import { SIGN_OUT_FAILED, SIGN_OUT_RETRY, errorTitleFor } from '@/lib/content/screen-states';
import { readCatalog, readConnectionProviders, readConnections } from '@/lib/platform/catalog';
import { readSubscriptions } from '@/lib/platform/runs';
import { readFaceIdEnabled, writeFaceIdEnabled } from '@/lib/platform/session-store';
import { toConnectionRows, toSolutions, type ConnectionView } from '@/lib/view/catalog';
import { administers } from '@/lib/view/roles';

const APPEARANCE: { label: string; mode: ThemeMode }[] = [
  { label: 'Dark', mode: 'dark' },
  { label: 'Light', mode: 'light' },
  { label: 'Auto', mode: 'auto' },
];

export default function SettingsScreen() {
  const { palette, mode, setMode } = useTheme();
  const biometric = useBiometricWording();
  const { totals } = useSolutions();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [faceId, setFaceId] = useState(false);
  const [faceIdError, setFaceIdError] = useState<string | null>(null);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const session = useSession();
  const { signOut } = session;
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const platformName = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'native';
  const appVersion = Constants.expoConfig?.version ?? '—';

  useEffect(() => {
    let cancelled = false;
    readFaceIdEnabled().then((enabled) => {
      if (!cancelled) setFaceId(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const changeFaceId = async (enabled: boolean) => {
    setFaceIdError(null);
    try {
      if (enabled) {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = hasHardware && (await LocalAuthentication.isEnrolledAsync());
        if (!enrolled) {
          setFaceIdError(biometric.unavailableOrUnenrolled);
          return;
        }
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: biometric.enablePrompt,
          disableDeviceFallback: true,
        });
        if (!result.success) {
          setFaceIdError(biometric.notEnabled);
          return;
        }
      }
      await writeFaceIdEnabled(enabled);
      setFaceId(enabled);
    } catch {
      setFaceIdError(biometric.notSaved);
    }
  };

  /**
   * The CONNECTIONS card needs both reads.
   *
   * Driven by the provider list rather than the connection list: the connections
   * read omits a provider with no connection at all, and the design draws
   * exactly that row ("Slack · Not connected"). The native authorize/complete
   * operations published in Round 6.6 also back the connection action below.
   */
  const connections = useWorkspaceResource(async (workspaceId) => {
    const [providers, held, catalog, subscriptions] = await Promise.all([
      readConnectionProviders(),
      readConnections(workspaceId),
      readCatalog(workspaceId),
      readSubscriptions(workspaceId),
    ]);
    return {
      rows: toConnectionRows(providers.providers, held.connections),
      // What is on the plan: the subscriptions it still has, not archived ones.
      solutions: toSolutions(catalog, subscriptions.subscriptions),
    };
  });

  // The plan totals need the priced catalog; the provider holds only overrides.
  const pricedSolutions = connections.status === 'ready' ? connections.data.solutions : [];
  const { activeCount, solutionsTotal, planTotal } = totals(pricedSolutions);

  const connectionRows: ConnectionView[] =
    connections.status === 'ready' ? connections.data.rows : [];

  const currentSession = session.status === 'signed-in' ? session.session : null;
  const activeWorkspace = currentSession?.workspaces.find(
    (workspace) => workspace.id === currentSession.user.activeWorkspaceId,
  ) ?? currentSession?.workspaces[0];
  const displayName = currentSession?.user.displayName?.trim() || currentSession?.user.email || 'Account';
  const initials = displayName
    .split(/\s+|@/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A';

  /**
   * Hidden below two workspaces, as the web switcher is — unless the session
   * says its list is truncated, in which case the collection may hold more and
   * only reading it can say. The trigger is the design's own WORKSPACE row.
   */
  const canSwitchWorkspace =
    currentSession !== null &&
    (currentSession.workspaces.length >= 2 || currentSession.workspacesTruncated === true);

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
    router.replace('/(auth)/login');
  };

  // The design applies gLoad/gErr/gOff to every screen but Home, Settings
  // included, so a failed read replaces the screen rather than stranding a
  // half-populated one. An unconfigured build is also a refusal; it does not
  // receive invented profile or connection rows.
  if (connections.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (connections.status === 'offline') {
    return <ScreenOffline onRetry={connections.reload} topInset={insets.top} />;
  }
  if (connections.status === 'unconfigured') {
    return (
      <ScreenUnavailable
        title={errorTitleFor('settings')}
        topInset={insets.top}
      />
    );
  }
  if (connections.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('settings')}
        onRetry={connections.reload} body={busyBody(connections)}
        topInset={insets.top}
      />
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}
      showsVerticalScrollIndicator={false}>
      <Text style={[styles.h1, { color: palette.text }]}>Settings</Text>

      {/* The account itself: linked sign-in accounts, and deleting it (24.6.2). */}
      <SurfaceCard style={styles.profileCard} onPress={() => router.push('/(tabs)/settings/account')}>
        <AvatarBadge initials={initials} size={48} fontSize={16} />
        <View style={styles.rowBody}>
          <Text style={[styles.profileName, { color: palette.text }]}>{displayName}</Text>
          <Text style={[styles.profileSub, { color: palette.neutral[400] }]}>
            {[currentSession?.user.email, activeWorkspace?.name].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <CaretRight size={16} color={palette.neutral[500]} />
      </SurfaceCard>

      <View>
        <SectionLabel>SECURITY</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          <SettingsRow
            icon={UserFocus}
            title={biometric.settingsTitle}
            sub={biometric.settingsSub}
            right={<NocToggle value={faceId} onChange={changeFaceId} />}
          />
        </SurfaceCard>
        {faceIdError ? (
          <ActionFailure message={faceIdError} retryLabel="Try again" onRetry={() => changeFaceId(true)} />
        ) : null}
      </View>

      <ConnectionsCard
        rows={connectionRows}
        loadedFor={connections.loadedFor}
        canManage={administers(activeWorkspace?.role)}
        onChanged={connections.reload}
      />

      <View>
        <SectionLabel>PLAN &amp; BILLING</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          <SettingsRow
            icon={CrownSimple}
            title="Solutions total"
            sub={`${activeCount} active from the published catalog`}
            divider
            right={
              <Text style={[styles.planTotal, { color: palette.accentRamp[300] }]}>
                {planTotal}/mo
              </Text>
            }
          />
          <SettingsRow
            icon={Storefront}
            title="Manage solutions"
            sub={`${activeCount} active · ${solutionsTotal}/mo`}
            divider
            onPress={() => router.push('/(tabs)/solutions')}
            right={<CaretRight size={15} color={palette.neutral[500]} />}
          />
          <SettingsRow
            icon={CreditCard}
            title="Billing"
            sub="Your plan, its price and status"
            testID="settings-billing"
            onPress={() => router.push('/(tabs)/settings/billing')}
            right={<CaretRight size={15} color={palette.neutral[500]} />}
          />
        </SurfaceCard>
      </View>

      <View>
        <SectionLabel>WORKSPACE</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          <SettingsRow
            icon={Buildings}
            title={activeWorkspace?.name ?? 'Workspace'}
            divider
            testID="workspace-switcher-row"
            onPress={canSwitchWorkspace ? () => setSwitcherOpen(true) : undefined}
            right={
              canSwitchWorkspace ? (
                <View style={styles.membersRight}>
                  <Text style={[styles.membersCount, { color: palette.neutral[500] }]}>
                    {activeWorkspace?.type ?? ''}
                  </Text>
                  <CaretRight size={15} color={palette.neutral[500]} testID="workspace-switcher-caret" />
                </View>
              ) : (
                <Text style={[styles.membersCount, { color: palette.neutral[500] }]}>{activeWorkspace?.type ?? ''}</Text>
              )
            }
          />
          <SettingsRow
            icon={Users}
            title="Your role"
            divider
            right={
              <View style={styles.membersRight}>
                <Text style={[styles.membersCount, { color: palette.neutral[500] }]}>
                  {activeWorkspace?.role ?? '—'}
                </Text>
              </View>
            }
          />
          {/* The admin areas the website keeps under /account (ADR-0032, 24.5).
              Teams belong to an organization, as the website's nav offers them. */}
          <SettingsRow
            icon={IdentificationBadge}
            title="Organization"
            divider
            testID="settings-organization"
            onPress={() => router.push('/(tabs)/settings/organization')}
            right={<CaretRight size={15} color={palette.neutral[500]} />}
          />
          <SettingsRow
            icon={FolderSimple}
            title="Projects"
            divider
            testID="settings-projects"
            onPress={() => router.push('/(tabs)/settings/projects')}
            right={<CaretRight size={15} color={palette.neutral[500]} />}
          />
          {activeWorkspace?.type === 'organization' ? (
            <SettingsRow
              icon={UsersThree}
              title="Teams"
              divider
              testID="settings-teams"
              onPress={() => router.push('/(tabs)/settings/teams')}
              right={<CaretRight size={15} color={palette.neutral[500]} />}
            />
          ) : null}
          <SettingsRow
            icon={DownloadSimple}
            title="Data export"
            divider
            testID="settings-data"
            onPress={() => router.push('/(tabs)/settings/data')}
            right={<CaretRight size={15} color={palette.neutral[500]} />}
          />
          <SettingsRow
            icon={Bell}
            title="Notifications"
            sub="In-app inbox from approvals and failed runs"
            right={<Text style={[styles.membersCount, { color: palette.neutral[500] }]}>In app</Text>}
          />
        </SurfaceCard>
      </View>

      <View>
        <SectionLabel>APPEARANCE</SectionLabel>
        <SurfaceCard style={styles.segCard}>
          {APPEARANCE.map((opt) => {
            const active = mode === opt.mode;
            return (
              <Pressable
                key={opt.mode}
                onPress={() => setMode(opt.mode)}
                style={[
                  styles.segOpt,
                  active && { borderWidth: 1, borderColor: palette.accent },
                ]}>
                <Text
                  style={{
                    fontFamily: active ? fonts.medium : fonts.regular,
                    fontSize: 13,
                    color: active ? palette.accent : palette.neutral[400],
                  }}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </SurfaceCard>
      </View>

      <View>
        <SectionLabel>HELP</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          <SettingsRow
            icon={Lifebuoy}
            title="Support"
            sub="Contact us, privacy and terms"
            testID="settings-support"
            onPress={() => router.push('/(tabs)/settings/support')}
            right={<CaretRight size={15} color={palette.neutral[500]} />}
          />
        </SurfaceCard>
      </View>

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
    fontSize: 26,
    letterSpacing: em(-0.015, 26),
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: layout.cardPad,
  },
  profileName: {
    fontFamily: fonts.medium,
    fontSize: 15.5,
  },
  profileSub: {
    marginTop: 1,
    fontFamily: fonts.regular,
    fontSize: 12.5,
  },
  sectionCard: {
    marginTop: 9,
  },
  rowBody: {
    flex: 1,
  },
  membersRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  planTotal: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  membersCount: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
  },
  segCard: {
    marginTop: 9,
    flexDirection: 'row',
    gap: 4,
    padding: 6,
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
    paddingVertical: 13,
    paddingHorizontal: layout.rowPadH,
  },
  signOutLabel: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  version: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 11,
  },
});
