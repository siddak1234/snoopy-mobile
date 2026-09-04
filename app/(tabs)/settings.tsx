import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  Bell,
  Buildings,
  CaretRight,
  Check,
  ClockClockwise,
  CrownSimple,
  Key,
  SignOut,
  Storefront,
  UserFocus,
  Users,
  type Icon,
} from 'phosphor-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarBadge } from '@/components/nocturne/avatar-badge';
import { NocToggle } from '@/components/nocturne/noc-toggle';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { TextField } from '@/components/nocturne/text-field';
import { ActionFailure, ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { em, fonts, layout, status } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useSession } from '@/hooks/use-session';
import { useSolutions } from '@/hooks/use-solutions';
import { useTheme, type ThemeMode } from '@/hooks/use-theme';
import { SIGN_OUT_FAILED, SIGN_OUT_RETRY, errorTitleFor } from '@/lib/content/screen-states';
import { readCatalog, readConnectionProviders, readConnections } from '@/lib/platform/catalog';
import {
  connectOAuthProvider,
  connectProviderWithKey,
  disconnectConnection,
} from '@/lib/platform/connections';
import { newIdempotencyKey } from '@/lib/platform/client';
import { readFaceIdEnabled, writeFaceIdEnabled } from '@/lib/platform/session-store';
import {
  readWorkspaces,
  selectActiveWorkspace,
  type WorkspaceSummary,
} from '@/lib/platform/workspaces';
import { toConnectionRows, toSolutions, type ConnectionView } from '@/lib/view/catalog';

function SettingsRow({
  icon: IconCmp,
  title,
  sub,
  right,
  divider = false,
  onPress,
  testID,
}: {
  icon: Icon;
  title: string;
  sub?: string;
  right: React.ReactNode;
  divider?: boolean;
  onPress?: () => void;
  testID?: string;
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
      <Pressable
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => [rowStyle, pressed && { opacity: 0.7 }]}>
        {body}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={rowStyle}>
      {body}
    </View>
  );
}

/**
 * The switcher's own read of the workspace collection, in the dialog's states.
 *
 * Read on open rather than taken from the session: the session's `workspaces`
 * is a bounded first page (`workspacesTruncated`), and the contract says to page
 * the documented collection rather than infer non-membership from it.
 */
type WorkspaceChoices =
  | { status: 'loading' }
  | { status: 'ready'; workspaces: WorkspaceSummary[]; activeWorkspaceId?: string }
  | { status: 'error'; message: string };

const WORKSPACE_TYPE_LABEL: Record<WorkspaceSummary['type'], string> = {
  personal: 'Personal',
  organization: 'Organization',
};

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
  const [faceId, setFaceId] = useState(false);
  const [faceIdError, setFaceIdError] = useState<string | null>(null);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const session = useSession();
  const { signOut } = session;
  const [selectedConnection, setSelectedConnection] = useState<ConnectionView | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionBusy, setConnectionBusy] = useState(false);
  const credentialKey = useRef(newIdempotencyKey('connection'));
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [choices, setChoices] = useState<WorkspaceChoices>({ status: 'loading' });
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  // The PATCH landed but `/v1/session` could not be re-read; offer the read again.
  const [reloadOwed, setReloadOwed] = useState(false);
  const choicesRequest = useRef(0);
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
          setFaceIdError('Face ID is not available or enrolled on this device.');
          return;
        }
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Enable Face ID unlock',
          disableDeviceFallback: true,
        });
        if (!result.success) {
          setFaceIdError('Face ID unlock was not enabled.');
          return;
        }
      }
      await writeFaceIdEnabled(enabled);
      setFaceId(enabled);
    } catch {
      setFaceIdError('Face ID preference could not be saved on this device.');
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

  const openWorkspaceSwitcher = () => {
    const requestId = ++choicesRequest.current;
    setSwitchError(null);
    setReloadOwed(false);
    setChoices({ status: 'loading' });
    setSwitcherOpen(true);
    readWorkspaces()
      .then((response) => {
        if (choicesRequest.current !== requestId) return;
        setChoices({
          status: 'ready',
          workspaces: response.workspaces,
          activeWorkspaceId: response.activeWorkspaceId ?? currentSession?.user.activeWorkspaceId,
        });
      })
      .catch((error: unknown) => {
        if (choicesRequest.current !== requestId) return;
        setChoices({
          status: 'error',
          message: error instanceof Error ? error.message : 'Workspaces could not be loaded.',
        });
      });
  };

  const closeWorkspaceSwitcher = () => {
    if (switching) return;
    choicesRequest.current += 1;
    setSwitcherOpen(false);
    setSwitchError(null);
    setReloadOwed(false);
  };

  /** Re-read `/v1/session` so the screens follow the server's active workspace. */
  const adoptSwitchedSession = async () => {
    const outcome = await session.reload();
    if (outcome.status === 'signed-in') {
      setReloadOwed(false);
      setSwitchError(null);
      setSwitcherOpen(false);
      return;
    }
    if (outcome.status === 'unavailable') {
      setReloadOwed(true);
      setSwitchError(
        `The workspace was switched, but this session could not be reloaded. ${outcome.message}`,
      );
    }
    // `signed-out`: the credential is gone and the route guard fails closed.
  };

  const chooseWorkspace = async (workspace: WorkspaceSummary) => {
    if (switching) return;
    const activeId = choices.status === 'ready' ? choices.activeWorkspaceId : undefined;
    if (workspace.id === activeId) {
      closeWorkspaceSwitcher();
      return;
    }
    setSwitching(workspace.id);
    setSwitchError(null);
    try {
      // One intent, one key: each selection is a new body, so a new key.
      await selectActiveWorkspace(workspace.id, newIdempotencyKey('workspace-activate'));
      await adoptSwitchedSession();
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : 'The workspace was not switched.');
    } finally {
      setSwitching(null);
    }
  };

  const retrySessionReload = async () => {
    if (switching) return;
    setSwitching('reload');
    try {
      await adoptSwitchedSession();
    } finally {
      setSwitching(null);
    }
  };

  const closeConnectionDialog = () => {
    setSelectedConnection(null);
    setCredentials({});
    setConnectionError(null);
    credentialKey.current = newIdempotencyKey('connection');
  };

  const updateCredential = (name: string, value: string) => {
    setCredentials((previous) => ({ ...previous, [name]: value }));
    credentialKey.current = newIdempotencyKey('connection');
  };

  const applyConnectionAction = async () => {
    if (!selectedConnection || !activeWorkspace || connectionBusy) return;
    setConnectionBusy(true);
    setConnectionError(null);
    try {
      if (selectedConnection.connected && selectedConnection.connectionId) {
        await disconnectConnection(activeWorkspace.id, selectedConnection.connectionId);
      } else if (selectedConnection.authType === 'oauth2') {
        const outcome = await connectOAuthProvider(activeWorkspace.id, selectedConnection.provider);
        if (outcome.status === 'cancelled') {
          // Not proof that nothing happened. A system browser sharing a
          // logged-in website session completes the connect AT the website and
          // skips the app handoff (manifest §12.1 #79); the person then closes
          // the sheet and the app sees `cancelled`. Re-reading the published
          // connections is the only honest answer, and it costs one read.
          closeConnectionDialog();
          connections.reload();
          return;
        }
        if (outcome.status === 'failed') {
          setConnectionError(outcome.message);
          return;
        }
      } else {
        const values = Object.fromEntries(
          selectedConnection.credentialFields.map((field) => [field.name, credentials[field.name]?.trim() ?? '']),
        );
        if (Object.values(values).some((value) => !value)) {
          setConnectionError('Complete every credential field before connecting.');
          return;
        }
        await connectProviderWithKey(
          activeWorkspace.id,
          selectedConnection.providerId,
          values,
          credentialKey.current,
        );
      }
      closeConnectionDialog();
      connections.reload();
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'The connection was not changed.');
    } finally {
      setConnectionBusy(false);
    }
  };

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
            title="Face ID unlock"
            sub="Require Face ID when opening"
            divider
            right={<NocToggle value={faceId} onChange={changeFaceId} />}
          />
          <SettingsRow
            icon={Key}
            title="Passkeys"
            sub="Managed by your identity provider"
            divider
            right={<Text style={[styles.membersCount, { color: palette.neutral[500] }]}>External</Text>}
          />
          <SettingsRow
            icon={ClockClockwise}
            title="Stay signed in"
            sub="Session stored in this device's secure enclave"
            right={<Text style={[styles.membersCount, { color: status.ok }]}>On</Text>}
          />
        </SurfaceCard>
        {faceIdError ? (
          <ActionFailure message={faceIdError} retryLabel="Try again" onRetry={() => changeFaceId(true)} />
        ) : null}
      </View>

      <View>
        <SectionLabel>CONNECTIONS</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          {connectionRows.map((c, i) => (
            <SettingsRow
              key={c.providerId}
              icon={c.icon}
              title={c.name}
              sub={c.sub}
              divider={i < connectionRows.length - 1}
              onPress={() => {
                setSelectedConnection(c);
                setConnectionError(null);
              }}
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
            onPress={canSwitchWorkspace ? openWorkspaceSwitcher : undefined}
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

      <Modal
        visible={selectedConnection !== null}
        transparent
        animationType="fade"
        onRequestClose={closeConnectionDialog}>
        <View style={[styles.overlay, { backgroundColor: status.overlay }]}>
          <View style={[styles.dialog, { backgroundColor: palette.surface, borderColor: palette.neutral[800] }]}>
            <Text style={[styles.dialogTitle, { color: palette.text }]}>
              {selectedConnection?.connected ? 'Disconnect' : 'Connect'} {selectedConnection?.name}
            </Text>
            <Text style={[styles.dialogBody, { color: palette.neutral[400] }]}>
              {selectedConnection?.connected
                ? selectedConnection.sub
                : selectedConnection?.provider.description}
            </Text>

            {selectedConnection?.authType === 'api-key' && !selectedConnection.connected
              ? selectedConnection.credentialFields.map((field) => (
                  <TextField
                    key={field.name}
                    label={field.label}
                    value={credentials[field.name] ?? ''}
                    onChangeText={(value) => updateCredential(field.name, value)}
                    secure={field.secret}
                    placeholder={field.help}
                  />
                ))
              : null}

            {connectionError ? (
              <Text style={[styles.dialogBody, { color: status.err }]}>{connectionError}</Text>
            ) : null}

            <View style={styles.dialogActions}>
              <Pressable
                onPress={closeConnectionDialog}
                style={[styles.dialogButton, { borderColor: palette.neutral[700] }]}>
                <Text style={[styles.dialogButtonLabel, { color: palette.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={connectionBusy}
                onPress={applyConnectionAction}
                style={[
                  styles.dialogButton,
                  { borderColor: selectedConnection?.connected ? status.err : palette.accent },
                ]}>
                <Text
                  style={[
                    styles.dialogButtonLabel,
                    { color: selectedConnection?.connected ? status.err : palette.accent },
                  ]}>
                  {connectionBusy
                    ? 'Working…'
                    : selectedConnection?.connected
                      ? 'Disconnect'
                      : 'Connect'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={switcherOpen}
        transparent
        animationType="fade"
        onRequestClose={closeWorkspaceSwitcher}>
        <View style={[styles.overlay, { backgroundColor: status.overlay }]}>
          <View
            testID="workspace-switcher-dialog"
            style={[styles.dialog, { backgroundColor: palette.surface, borderColor: palette.neutral[800] }]}>
            <Text style={[styles.dialogTitle, { color: palette.text }]}>Switch workspace</Text>
            <Text style={[styles.dialogBody, { color: palette.neutral[400] }]}>
              Every screen reads from the active workspace. Connections and solutions are
              workspace-wide.
            </Text>

            {choices.status === 'loading' ? (
              <Text style={[styles.dialogBody, { color: palette.neutral[400] }]}>Loading workspaces…</Text>
            ) : null}
            {choices.status === 'error' ? (
              <Text style={[styles.dialogBody, { color: status.err }]}>{choices.message}</Text>
            ) : null}
            {choices.status === 'ready' ? (
              <View style={styles.switcherList}>
                {choices.workspaces.map((workspace, i) => {
                  const active = workspace.id === choices.activeWorkspaceId;
                  return (
                    <SettingsRow
                      key={workspace.id}
                      icon={Buildings}
                      title={workspace.name}
                      sub={WORKSPACE_TYPE_LABEL[workspace.type]}
                      divider={i < choices.workspaces.length - 1}
                      testID={`workspace-option-${workspace.id}`}
                      onPress={switching ? undefined : () => chooseWorkspace(workspace)}
                      right={
                        switching === workspace.id ? (
                          <Text style={[styles.membersCount, { color: palette.neutral[500] }]}>Switching…</Text>
                        ) : active ? (
                          <Check
                            size={16}
                            color={palette.accent}
                            testID={`workspace-active-${workspace.id}`}
                          />
                        ) : null
                      }
                    />
                  );
                })}
              </View>
            ) : null}

            {switchError ? (
              <Text testID="workspace-switch-error" style={[styles.dialogBody, { color: status.err }]}>
                {switchError}
              </Text>
            ) : null}

            <View style={styles.dialogActions}>
              <Pressable
                disabled={switching !== null}
                onPress={closeWorkspaceSwitcher}
                style={[styles.dialogButton, { borderColor: palette.neutral[700] }]}>
                <Text style={[styles.dialogButtonLabel, { color: palette.text }]}>
                  {reloadOwed ? 'Close' : 'Cancel'}
                </Text>
              </Pressable>
              {reloadOwed ? (
                <Pressable
                  disabled={switching !== null}
                  onPress={retrySessionReload}
                  style={[styles.dialogButton, { borderColor: palette.accent }]}>
                  <Text style={[styles.dialogButtonLabel, { color: palette.accent }]}>
                    {switching === 'reload' ? 'Working…' : 'Reload session'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
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
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: layout.screenX,
  },
  dialog: {
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 20,
  },
  dialogTitle: {
    fontFamily: fonts.medium,
    fontSize: 18,
  },
  dialogBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  switcherList: {
    marginHorizontal: -layout.rowPadH,
  },
  dialogButton: {
    minWidth: 96,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dialogButtonLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
  },
});
