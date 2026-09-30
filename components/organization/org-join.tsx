import { Buildings } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { TextField } from '@/components/nocturne/text-field';
import { SettingsRow } from '@/components/settings/settings-row';
import { fonts, status } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useTheme } from '@/hooks/use-theme';
import { refusalMessage } from '@/lib/content/refusals';
import {
  cancelJoinRequest,
  claimDomain,
  createOrganization,
  requestToJoin,
  type DiscoverableOrganization,
} from '@/lib/platform/organization';

/**
 * For someone in no organization yet (24.5.1): the organizations their verified
 * email domain belongs to, which they can join or ask to join, and — when that
 * domain is their company's — setting one up. The website's onboarding
 * `join-org` and `setup-org`, and its Settings section. Neither names a
 * workspace a screen loaded: joining names the organization discovery found,
 * and creating makes a new one.
 */
export function OrgJoin({
  found,
  domain,
  canSetUp,
  onJoined,
}: {
  found: DiscoverableOrganization[];
  /** The person's email domain, when it is an address at all. */
  domain: string;
  /** A company domain rather than a mailbox provider's. */
  canSetUp: boolean;
  /** Joined or created: the session gains a workspace, and the screen reads again. */
  onJoined: () => void;
}) {
  const { palette } = useTheme();
  return (
    <>
      <View>
        <SectionLabel>YOUR ORGANIZATION</SectionLabel>
        <SurfaceCard style={styles.card}>
          {found.length === 0 ? (
            <Text style={[styles.text, styles.pad, { color: palette.neutral[400] }]}>
              No organization is registered to your email domain yet.
            </Text>
          ) : null}
          {found.map((organization) => (
            <FoundOrganization key={organization.workspaceId} organization={organization} onJoined={onJoined} />
          ))}
        </SurfaceCard>
      </View>
      {canSetUp ? <SetUpOrganization domain={domain} onCreated={onJoined} /> : null}
    </>
  );
}

function FoundOrganization({
  organization,
  onJoined,
}: {
  organization: DiscoverableOrganization;
  onJoined: () => void;
}) {
  const { palette } = useTheme();
  const keys = useIntentKeys(`organization-join-${organization.workspaceId}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The request this person made here: the discovery read does not carry its
  // id, so only one made now can be cancelled, as on the website.
  const [requestId, setRequestId] = useState<string | null>(null);
  const requested = organization.membershipState === 'requested' || requestId !== null;

  const join = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const answer = await requestToJoin(organization.workspaceId, keys.keyFor('join'));
      keys.settle('join');
      if (answer.outcome === 'joined') onJoined();
      else setRequestId(answer.request?.id ?? null);
    } catch (caught) {
      setError(refusalMessage(caught, {}, 'The organization could not be joined.'));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (busy || !requestId) return;
    setBusy(true);
    setError(null);
    try {
      await cancelJoinRequest(organization.workspaceId, requestId, keys.keyFor(`cancel-${requestId}`));
      keys.settle(`cancel-${requestId}`);
      setRequestId(null);
      onJoined();
    } catch (caught) {
      setError(refusalMessage(caught, {}, 'The join request could not be cancelled.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.found}>
      <SettingsRow
        icon={Buildings}
        title={organization.name}
        sub={`Your verified email domain, ${organization.domain}, is registered to it.`}
        right={null}
      />
      <View style={styles.pad}>
        {organization.membershipState === 'member' ? (
          <Text style={[styles.text, { color: palette.neutral[400] }]}>You are a member.</Text>
        ) : requestId ? (
          <>
            <Text style={[styles.text, { color: palette.neutral[400] }]}>Your request was sent for approval.</Text>
            <PillButton label={busy ? 'Cancelling…' : 'Cancel request'} variant="secondary" height={42} disabled={busy} onPress={cancel} />
          </>
        ) : (
          <PillButton
            label={busy ? 'Joining…' : requested ? 'Request pending' : `Join ${organization.name}`}
            variant="primary"
            height={42}
            disabled={busy || requested}
            onPress={join}
          />
        )}
        {error ? <Text style={[styles.text, { color: status.err }]}>{error}</Text> : null}
      </View>
    </View>
  );
}

function SetUpOrganization({ domain, onCreated }: { domain: string; onCreated: () => void }) {
  const { palette } = useTheme();
  const keys = useIntentKeys('organization');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The organization already made, when its domain claim failed: a retry then
  // claims again, and never makes a second organization.
  const [createdId, setCreatedId] = useState<string | null>(null);

  const create = async () => {
    if (busy) return;
    if (!name.trim() && !createdId) {
      setError('Organization name is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // The website's two steps: the organization, made active, then its claim
      // on this email domain, joined by approval.
      let workspaceId = createdId;
      if (!workspaceId) {
        const created = await createOrganization(name.trim(), keys.keyFor('create'));
        keys.settle('create');
        workspaceId = created.workspace.id;
        setCreatedId(workspaceId);
      }
      await claimDomain(workspaceId, { domain, joinPolicy: 'approval' }, keys.keyFor('claim'));
      keys.settle('claim');
      onCreated();
    } catch (caught) {
      setError(refusalMessage(caught, {}, 'The organization could not be created.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <SectionLabel>SET UP AN ORGANIZATION</SectionLabel>
      <SurfaceCard style={[styles.card, styles.pad]}>
        <Text style={[styles.text, { color: palette.neutral[400] }]}>
          Your email uses the domain {domain}. Create an organization workspace for your team.
        </Text>
        <TextField
          label="Organization name"
          value={name}
          onChangeText={(next) => {
            setName(next);
            keys.settle('create');
          }}
          placeholder="Acme Corp"
          autoComplete="organization"
        />
        {error ? <Text style={[styles.text, { color: status.err }]}>{error}</Text> : null}
        <PillButton
          label={busy ? 'Creating…' : createdId ? `Claim ${domain} again` : 'Create organization'}
          variant="primary"
          height={46}
          disabled={busy}
          onPress={create}
        />
      </SurfaceCard>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 9 },
  pad: { padding: 14, gap: 10 },
  found: { paddingBottom: 4 },
  text: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
});
