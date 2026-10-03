import { useRouter } from 'expo-router';
import { Buildings, CaretRight, ShareNetwork } from 'phosphor-react-native';
import React, { useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { BackCircle } from '@/components/nocturne/back-circle';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { TextField } from '@/components/nocturne/text-field';
import { OrgDomains } from '@/components/organization/org-domains';
import { OrgJoin } from '@/components/organization/org-join';
import { OrgPeople } from '@/components/organization/org-people';
import { ScreenEmpty, ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { SettingsRow } from '@/components/settings/settings-row';
import { em, fonts, layout, typeScale } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { joinLinkLine } from '@/lib/content/join-link';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { ORGANIZATION_EMPTY_BODY, ORGANIZATION_EMPTY_TITLE, errorTitleFor } from '@/lib/content/screen-states';
import {
  discoverOrganizations,
  joinLink,
  readDomains,
  readJoinRequests,
  readWorkspaceMembers,
  renameWorkspace,
} from '@/lib/platform/organization';
import { readWorkspaces } from '@/lib/platform/workspaces';
import { emailDomain, isPublicDomain } from '@/lib/view/domain';
import { administers } from '@/lib/view/roles';

/**
 * Settings → Organization (BUILD-PLAN 24.5.1) — the website's organization
 * page, and its onboarding for someone in no organization yet.
 *
 * What it offers follows the workspace collection, not the session's list,
 * which may be truncated (the website reads the collection for the same
 * reason):
 * - an owner or admin of the active organization manages its name, domains,
 *   members and join requests;
 * - someone in an organization otherwise is told who manages it;
 * - someone in none finds the organization their email domain belongs to, and
 *   on a company domain can set one up; with neither, the screen is the
 *   empty-state standard (24.12).
 *
 * An owner or admin shares the organization's join link (24.12, the owner's
 * decision 5): the website's join page for it, which accepts a request only
 * from someone at a verified email domain the organization shows for matching
 * emails — the line under it follows that domain's joining policy
 * (`joinLinkLine`), or says what to do first.
 */
export default function OrganizationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const session = useSession();
  const [renaming, setRenaming] = useState(false);
  const user = session.status === 'signed-in' ? session.session.user : null;

  const org = useWorkspaceResource(async (workspaceId) => {
    const { workspaces } = await readWorkspaces();
    const active = workspaces.find((workspace) => workspace.id === workspaceId);
    if (active?.type === 'organization' && administers(active.role)) {
      const [members, domains, requests] = await Promise.all([
        readWorkspaceMembers(workspaceId),
        readDomains(workspaceId),
        readJoinRequests(workspaceId),
      ]);
      return { kind: 'manage' as const, workspace: active, members, domains, requests };
    }
    const organizations = workspaces.filter((workspace) => workspace.type === 'organization');
    if (organizations.length > 0) return { kind: 'member' as const, active, organizations };
    return { kind: 'find' as const, found: await discoverOrganizations() };
  });

  // Joining or creating adds a workspace to the session, and may make it active.
  const afterJoin = () => {
    void session.reload().then(() => org.reload());
  };

  if (org.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (org.status === 'offline') {
    return <ScreenOffline onRetry={org.reload} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (org.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('organization')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (org.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('organization')}
        onRetry={org.reload}
        body={busyBody(org)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const data = org.data;
  const domain = emailDomain(user?.email);
  const canSetUp = domain !== '' && !isPublicDomain(domain);
  const muted = { color: palette.neutral[400] };

  if (data.kind === 'find' && data.found.length === 0 && !canSetUp) {
    return (
      <ScreenEmpty
        icon={<Buildings size={40} color={palette.accentRamp[300]} />}
        title={ORGANIZATION_EMPTY_TITLE}
        body={ORGANIZATION_EMPTY_BODY}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const link = data.kind === 'manage' ? joinLink(data.workspace.id) : null;
  // iOS shares the link itself; Android's share intent carries text (as data.tsx shares).
  const shareJoinLink = (address: string) => {
    void Share.share(Platform.OS === 'ios' ? { url: address } : { message: address }).catch(() => undefined);
  };

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>Organization</Text>
          <Text style={[styles.subtitle, muted]}>
            {data.kind === 'manage' ? 'Manage your organization settings and members.' : 'Your organization workspace'}
          </Text>
        </View>
      </View>

      {data.kind === 'manage' ? (
        <>
          <View>
            <SectionLabel>ORGANIZATION DETAILS</SectionLabel>
            <SurfaceCard style={styles.card}>
              <SettingsRow
                icon={Buildings}
                title="Name"
                testID="organization-name"
                divider={link !== null}
                onPress={() => setRenaming(true)}
                right={
                  <View style={styles.right}>
                    <Text style={[styles.value, muted]}>{data.workspace.name}</Text>
                    <CaretRight size={15} color={palette.neutral[500]} />
                  </View>
                }
              />
              {link ? (
                <SettingsRow
                  icon={ShareNetwork}
                  title="Share join link"
                  sub={joinLinkLine(data.domains)}
                  testID="organization-join-link"
                  onPress={() => shareJoinLink(link)}
                  right={<CaretRight size={15} color={palette.neutral[500]} />}
                />
              ) : null}
            </SurfaceCard>
          </View>
          <OrgDomains domains={data.domains} shownWorkspaceId={org.loadedFor} onChanged={org.reload} />
          <OrgPeople
            orgName={data.workspace.name}
            viewerUserId={user?.userId ?? null}
            members={data.members}
            requests={data.requests}
            shownWorkspaceId={org.loadedFor}
            onChanged={org.reload}
          />
          {renaming ? (
            <RenameDialog
              initialName={data.workspace.name}
              shownWorkspaceId={org.loadedFor}
              onClose={() => setRenaming(false)}
              onRenamed={() => {
                setRenaming(false);
                afterJoin();
              }}
            />
          ) : null}
        </>
      ) : data.kind === 'member' ? (
        <SurfaceCard style={styles.note}>
          <Text style={[styles.text, muted]}>
            {data.active?.type === 'organization'
              ? `Only ${data.active.name}'s owners and admins manage it.`
              : `You belong to ${data.organizations.map((entry) => entry.name).join(', ')}. Switch to it in Settings; its owners and admins manage it there.`}
          </Text>
        </SurfaceCard>
      ) : (
        <OrgJoin found={data.found} domain={domain} canSetUp={canSetUp} onJoined={afterJoin} />
      )}
    </ScrollView>
  );
}

function RenameDialog({
  initialName,
  shownWorkspaceId,
  onClose,
  onRenamed,
}: {
  initialName: string;
  shownWorkspaceId: string | null;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const session = useSession();
  const keys = useIntentKeys('workspace-update');
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    if (name.trim() === initialName) {
      onClose();
      return;
    }
    if (!name.trim()) {
      setError('Organization name is required.');
      return;
    }
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await renameWorkspace(workspaceId, name.trim(), keys.keyFor());
      keys.settle();
      onRenamed();
    } catch (caught) {
      setError(refusalMessage(caught, {}, 'The organization name could not be updated.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      visible
      testID="rename-organization-dialog"
      onRequestClose={busy ? () => undefined : onClose}
      title="Organization name"
      actions={
        <>
          <DialogButton label="Cancel" disabled={busy} onPress={onClose} />
          <DialogButton tone="accent" label={busy ? 'Saving…' : 'Save'} disabled={busy || !name.trim()} onPress={save} />
        </>
      }>
      <TextField
        label="Name"
        value={name}
        onChangeText={(next) => {
          setName(next);
          keys.settle();
        }}
      />
      {error ? <DialogText tone="error">{error}</DialogText> : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: 32, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1 },
  title: { fontFamily: fonts.medium, fontSize: typeScale.heading.fontSize, letterSpacing: em(-0.01, typeScale.heading.fontSize) },
  subtitle: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize, marginTop: 1 },
  card: { marginTop: 9 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '55%' },
  value: { fontFamily: fonts.regular, fontSize: typeScale.body.fontSize },
  note: { padding: 14 },
  text: { fontFamily: fonts.regular, ...typeScale.body },
});
