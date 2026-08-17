import { useRouter } from 'expo-router';
import {
  Bell,
  Buildings,
  CaretRight,
  ClockClockwise,
  CreditCard,
  CrownSimple,
  Key,
  Receipt,
  SignOut,
  Storefront,
  UserFocus,
  Users,
  type Icon,
} from 'phosphor-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarBadge } from '@/components/nocturne/avatar-badge';
import { NocToggle } from '@/components/nocturne/noc-toggle';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ActionFailure, ScreenError, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import { em, fonts, layout, status } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useSession } from '@/hooks/use-session';
import { useSolutions } from '@/hooks/use-solutions';
import { useTheme, type ThemeMode } from '@/hooks/use-theme';
import { SIGN_OUT_FAILED, SIGN_OUT_RETRY, errorTitleFor } from '@/lib/content/screen-states';
import { defaultActiveSolutions, settingsConnections, solutionDefs } from '@/lib/fixtures';
import { readCatalog, readConnectionProviders, readConnections } from '@/lib/platform/catalog';
import { toConnectionRows, toSolutions, type ConnectionView } from '@/lib/view/catalog';

function SettingsRow({
  icon: IconCmp,
  title,
  sub,
  right,
  divider = false,
  onPress,
}: {
  icon: Icon;
  title: string;
  sub?: string;
  right: React.ReactNode;
  divider?: boolean;
  onPress?: () => void;
}) {
  const { palette } = useTheme();
  const body = (
    <>
      <IconCmp size={20} color={palette.accentRamp[300]} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: palette.text }]}>{title}</Text>
        {sub ? <Text style={[styles.rowSub, { color: palette.neutral[400] }]}>{sub}</Text> : null}
      </View>
      {right}
    </>
  );
  const rowStyle = [
    styles.row,
    divider && { borderBottomWidth: 1, borderBottomColor: palette.divider },
  ];
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [rowStyle, pressed && { opacity: 0.7 }]}>
        {body}
      </Pressable>
    );
  }
  return <View style={rowStyle}>{body}</View>;
}

const APPEARANCE: { label: string; mode: ThemeMode }[] = [
  { label: 'Dark', mode: 'dark' },
  { label: 'Light', mode: 'light' },
  { label: 'Auto', mode: 'auto' },
];

export default function SettingsScreen() {
  const { palette, mode, setMode } = useTheme();
  const { totals } = useSolutions();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [faceId, setFaceId] = useState(true);
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const { signOut } = useSession();

  /**
   * The CONNECTIONS card needs both reads.
   *
   * Driven by the provider list rather than the connection list: the connections
   * read omits a provider with no connection at all, and the design draws
   * exactly that row ("Slack · Not connected"). Both are plain authenticated
   * GETs — §12.1 #62 blocks *completing* a connection on native, not reading
   * which ones exist.
   */
  const connections = useWorkspaceResource(async (workspaceId) => {
    const [providers, held, catalog] = await Promise.all([
      readConnectionProviders(),
      readConnections(workspaceId),
      readCatalog(workspaceId),
    ]);
    return {
      rows: toConnectionRows(providers.providers, held.connections),
      solutions: toSolutions(catalog),
    };
  });

  // The plan totals need the priced catalog; the provider holds only overrides.
  const pricedSolutions =
    connections.status === 'ready'
      ? connections.data.solutions
      : solutionDefs.map((sol, i) => ({
          ...sol,
          templateId: sol.name,
          subscribed: defaultActiveSolutions.includes(i),
        }));
  const { activeCount, solutionsTotal, planTotal } = totals(pricedSolutions);

  // As with Templates, the fixture survives only for the unconfigured build.
  const connectionRows: ConnectionView[] =
    connections.status === 'ready' ? connections.data.rows : settingsConnections;

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
    router.replace('/(auth)/welcome');
  };

  // The design applies gLoad/gErr/gOff to every screen but Home, Settings
  // included, so a failed read replaces the screen rather than stranding a
  // half-populated one. `unconfigured` is not among them: it falls through to
  // the prototype content below.
  if (connections.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (connections.status === 'offline') {
    return <ScreenOffline onRetry={connections.reload} topInset={insets.top} />;
  }
  if (connections.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('settings')}
        onRetry={connections.reload}
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

      <SurfaceCard style={styles.profileCard}>
        <AvatarBadge initials="AK" size={48} fontSize={16} />
        <View style={styles.rowBody}>
          <Text style={[styles.profileName, { color: palette.text }]}>Alex Kim</Text>
          <Text style={[styles.profileSub, { color: palette.neutral[400] }]}>
            alex@acme.co · Acme Operations
          </Text>
        </View>
        <CaretRight size={16} color={palette.neutral[500]} />
      </SurfaceCard>

      <View>
        <SectionLabel>SECURITY</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          <SettingsRow
            icon={UserFocus}
            title="Face ID unlock"
            sub="Require Face ID when opening"
            divider
            right={<NocToggle value={faceId} onChange={setFaceId} />}
          />
          <SettingsRow
            icon={Key}
            title="Passkeys"
            sub="1 passkey · iPhone"
            divider
            onPress={() => {}}
            right={<CaretRight size={15} color={palette.neutral[500]} />}
          />
          <SettingsRow
            icon={ClockClockwise}
            title="Stay signed in"
            sub="Keep this device logged in"
            right={<NocToggle value={staySignedIn} onChange={setStaySignedIn} />}
          />
        </SurfaceCard>
      </View>

      <View>
        <SectionLabel>CONNECTIONS</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          {connectionRows.map((c, i) => (
            <SettingsRow
              key={c.name}
              icon={c.icon}
              title={c.name}
              sub={c.sub}
              divider={i < connectionRows.length - 1}
              onPress={() => {}}
              right={
                c.connected ? (
                  <View style={styles.connectedRight}>
                    <View style={[styles.greenDot, { backgroundColor: status.ok }]} />
                    <CaretRight size={15} color={palette.neutral[500]} />
                  </View>
                ) : (
                  <Text style={[styles.connectLink, { color: palette.accentRamp[300] }]}>
                    Connect
                  </Text>
                )
              }
            />
          ))}
        </SurfaceCard>
      </View>

      <View>
        <SectionLabel>PLAN &amp; BILLING</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          <SettingsRow
            icon={CrownSimple}
            title="Growth plan"
            sub="$99/mo base · renews Sep 1"
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
            title="Payment method"
            sub="Visa ···· 4242"
            divider
            onPress={() => {}}
            right={<CaretRight size={15} color={palette.neutral[500]} />}
          />
          <SettingsRow
            icon={Receipt}
            title="Invoices"
            sub={`Last: Aug 1 · ${planTotal}`}
            onPress={() => {}}
            right={<CaretRight size={15} color={palette.neutral[500]} />}
          />
        </SurfaceCard>
      </View>

      <View>
        <SectionLabel>WORKSPACE</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          <SettingsRow
            icon={Buildings}
            title="Acme Operations"
            divider
            onPress={() => {}}
            right={<CaretRight size={15} color={palette.neutral[500]} />}
          />
          <SettingsRow
            icon={Users}
            title="Members"
            divider
            onPress={() => {}}
            right={
              <View style={styles.membersRight}>
                <Text style={[styles.membersCount, { color: palette.neutral[500] }]}>12</Text>
                <CaretRight size={15} color={palette.neutral[500]} />
              </View>
            }
          />
          <SettingsRow
            icon={Bell}
            title="Notifications"
            right={<NocToggle value={notifications} onChange={setNotifications} />}
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
        Autom8x for iOS · v1.0.0
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
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: layout.rowPadH,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  rowSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
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
  connectedRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
  },
  connectLink: {
    fontFamily: fonts.medium,
    fontSize: 13,
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
