import { CaretRight, GlobeHemisphereWest, Plus } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { NocToggle } from '@/components/nocturne/noc-toggle';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { TextField } from '@/components/nocturne/text-field';
import { SettingsRow } from '@/components/settings/settings-row';
import { fonts } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import {
  claimDomain,
  revokeDomain,
  updateDomain,
  verifyDomain,
  type JoinPolicy,
  type OrganizationDomain,
} from '@/lib/platform/organization';

const JOIN_POLICIES = [
  { value: 'approval', label: 'Approval' },
  { value: 'automatic', label: 'Automatic' },
  { value: 'invite_only', label: 'Invite only' },
] as const;

const STATUS: Record<OrganizationDomain['status'], string> = {
  pending: 'Pending',
  verified: 'Verified',
  suspended: 'Suspended',
  revoked: 'Revoked',
};

/**
 * The organization's email domains and how people with them join (24.5.1) —
 * the website's `OrgDomainSection`, on the same five operations. A domain is
 * claimed, proved with a DNS record, and can be revoked; its join policy and
 * whether it is shown to matching people are its settings.
 */
export function OrgDomains({
  domains,
  shownWorkspaceId,
  onChanged,
}: {
  domains: OrganizationDomain[];
  /** The workspace the screen loaded; every change is refused once it is not active. */
  shownWorkspaceId: string | null;
  onChanged: () => void;
}) {
  const { palette } = useTheme();
  const [open, setOpen] = useState<OrganizationDomain | 'add' | null>(null);

  return (
    <View>
      <SectionLabel>DOMAINS</SectionLabel>
      <SurfaceCard style={styles.card}>
        {domains.length === 0 ? (
          <Text style={[styles.empty, { color: palette.neutral[400] }]}>No domain associated with this workspace.</Text>
        ) : null}
        {domains.map((domain) => (
          <SettingsRow
            key={domain.id}
            testID={`domain-${domain.domain}`}
            icon={GlobeHemisphereWest}
            title={domain.domain}
            sub={
              domain.status === 'verified'
                ? `${STATUS[domain.status]} · ${policyLabel(domain.joinPolicy)}`
                : `${STATUS[domain.status]} · Add the DNS record named ${domain.verificationRecordName}, then verify this domain.`
            }
            divider
            onPress={() => setOpen(domain)}
            right={<CaretRight size={15} color={palette.neutral[500]} />}
          />
        ))}
        <SettingsRow
          icon={Plus}
          title="Add domain"
          testID="add-domain"
          onPress={() => setOpen('add')}
          right={<CaretRight size={15} color={palette.neutral[500]} />}
        />
      </SurfaceCard>
      {open === 'add' ? (
        <AddDomainDialog
          shownWorkspaceId={shownWorkspaceId}
          onClose={(claimed) => {
            setOpen(null);
            if (claimed) onChanged();
          }}
        />
      ) : open ? (
        <DomainDialog
          domain={open}
          shownWorkspaceId={shownWorkspaceId}
          onClose={() => setOpen(null)}
          onChanged={() => {
            setOpen(null);
            onChanged();
          }}
        />
      ) : null}
    </View>
  );
}

function policyLabel(policy: JoinPolicy): string {
  return JOIN_POLICIES.find((option) => option.value === policy)?.label ?? policy;
}

function DomainDialog({
  domain,
  shownWorkspaceId,
  onClose,
  onChanged,
}: {
  domain: OrganizationDomain;
  shownWorkspaceId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { palette } = useTheme();
  const session = useSession();
  const keys = useIntentKeys(`domain-${domain.id}`);
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>(domain.joinPolicy);
  const [discovery, setDiscovery] = useState(domain.discoveryEnabled);
  const [busy, setBusy] = useState<'save' | 'verify' | 'revoke' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (which: 'save' | 'verify' | 'revoke', fallback: string) => {
    if (busy) return;
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(which);
    setError(null);
    try {
      if (which === 'save') {
        await updateDomain(workspaceId, domain.id, { joinPolicy, discoveryEnabled: discovery }, keys.keyFor(which));
      } else if (which === 'verify') {
        await verifyDomain(workspaceId, domain.id, keys.keyFor(which));
      } else {
        await revokeDomain(workspaceId, domain.id, keys.keyFor(which));
      }
      keys.settle(which);
      onChanged();
    } catch (caught) {
      setError(refusalMessage(caught, {}, fallback));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      visible
      testID="domain-dialog"
      onRequestClose={busy ? () => undefined : onClose}
      title={domain.domain}
      body={
        domain.status === 'verified'
          ? STATUS[domain.status]
          : `${STATUS[domain.status]}. Add the DNS record named ${domain.verificationRecordName}, then verify this domain.`
      }
      actions={
        <>
          <DialogButton label="Close" disabled={busy !== null} onPress={onClose} />
          {domain.status !== 'revoked' ? (
            <DialogButton
              tone="danger"
              label={busy === 'revoke' ? 'Revoking…' : 'Revoke'}
              disabled={busy !== null}
              onPress={() => act('revoke', 'The domain could not be revoked.')}
            />
          ) : null}
          {domain.status !== 'verified' ? (
            <DialogButton
              label={busy === 'verify' ? 'Verifying…' : 'Verify DNS'}
              disabled={busy !== null}
              onPress={() => act('verify', 'The domain could not be verified.')}
            />
          ) : null}
          <DialogButton
            tone="accent"
            label={busy === 'save' ? 'Saving…' : 'Save settings'}
            disabled={busy !== null}
            onPress={() => act('save', 'The domain settings could not be updated.')}
          />
        </>
      }>
      <ChoiceChips label="Joining" options={JOIN_POLICIES} value={joinPolicy} onChange={setJoinPolicy} />
      <View style={styles.toggleRow}>
        <Text style={[styles.toggleLabel, { color: palette.text }]}>Show for matching verified email domains</Text>
        <NocToggle value={discovery} onChange={setDiscovery} />
      </View>
      {error ? <DialogText tone="error">{error}</DialogText> : null}
    </Dialog>
  );
}

function AddDomainDialog({
  shownWorkspaceId,
  onClose,
}: {
  shownWorkspaceId: string | null;
  /**
   * Whether a domain was claimed, so the screen reads again — on close, not at
   * once: the re-read replaces the screen, and the verification value would go
   * with it before it was seen.
   */
  onClose: (claimed: boolean) => void;
}) {
  const { palette } = useTheme();
  const session = useSession();
  const keys = useIntentKeys('domain-claim');
  const [domain, setDomain] = useState('');
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>('approval');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Given in the first answer to a claim only, never again: shown until closed.
  const [recordValue, setRecordValue] = useState<string | null>(null);

  const claim = async () => {
    if (busy) return;
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const claimed = await claimDomain(workspaceId, { domain: domain.trim(), joinPolicy }, keys.keyFor());
      keys.settle();
      setDomain('');
      if (claimed.verificationRecordValue) setRecordValue(claimed.verificationRecordValue);
      else onClose(true);
    } catch (caught) {
      setError(refusalMessage(caught, {}, 'The domain could not be claimed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      visible
      testID="add-domain-dialog"
      onRequestClose={busy ? () => undefined : () => onClose(recordValue !== null)}
      title="Add domain"
      actions={
        <>
          <DialogButton label={recordValue ? 'Done' : 'Cancel'} disabled={busy} onPress={() => onClose(recordValue !== null)} />
          {recordValue ? null : (
            <DialogButton tone="accent" label={busy ? 'Adding…' : 'Add domain'} disabled={busy} onPress={claim} />
          )}
        </>
      }>
      {recordValue ? (
        <View>
          <DialogText>DNS verification value:</DialogText>
          <Text selectable style={[styles.value, { color: palette.text }]}>
            {recordValue}
          </Text>
        </View>
      ) : (
        <>
          <TextField
            label="Domain"
            value={domain}
            onChangeText={(next) => {
              setDomain(next);
              keys.settle();
            }}
            placeholder="acme.co"
          />
          <ChoiceChips label="Joining" options={JOIN_POLICIES} value={joinPolicy} onChange={setJoinPolicy} />
        </>
      )}
      {error ? <DialogText tone="error">{error}</DialogText> : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 9 },
  empty: { fontFamily: fonts.regular, fontSize: 13, paddingHorizontal: 14, paddingTop: 13 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { flex: 1, fontFamily: fonts.regular, fontSize: 13 },
  value: { fontFamily: fonts.medium, fontSize: 13, marginTop: 4 },
});
