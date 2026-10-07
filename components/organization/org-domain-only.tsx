import { ShieldCheck } from 'phosphor-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NocToggle } from '@/components/nocturne/noc-toggle';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ActionFailure } from '@/components/screen-state';
import { SettingsRow } from '@/components/settings/settings-row';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { DOMAIN_ONLY_SUB, DOMAIN_ONLY_TITLE, WORKSPACE_CHANGED, domainOnlyRefusal } from '@/lib/content/refusals';
import { setDomainOnly } from '@/lib/platform/organization';

/**
 * The organization's domain-only setting (the owner's build 13 decision 8B),
 * under its domains: while on, only people whose every sign-in address is at a
 * verified domain can join, and a member cannot link an account outside them.
 * Turning it on is refused while there is no verified domain, or while any
 * member signs in from outside one — nobody is ever removed; turning it off
 * always succeeds. The toggle moves at the press and moves back if refused.
 */
export function OrgDomainOnly({
  on,
  shownWorkspaceId,
  onChanged,
}: {
  on: boolean;
  /** The workspace the screen loaded; the change is refused once it is not active. */
  shownWorkspaceId: string | null;
  onChanged: () => void;
}) {
  const session = useSession();
  const keys = useIntentKeys('workspace-domain-only');
  const [pending, setPending] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(!on);

  // The platform's answer, once read again, replaces what the press showed.
  useEffect(() => setPending(null), [on]);

  const change = async (next: boolean) => {
    if (busy) return;
    attempted.current = next;
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    const intent = next ? 'on' : 'off';
    setBusy(true);
    setError(null);
    setPending(next);
    try {
      await setDomainOnly(workspaceId, next, keys.keyFor(intent));
      keys.settle(intent);
      onChanged();
    } catch (caught) {
      setPending(null);
      setError(domainOnlyRefusal(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <SectionLabel>WHO CAN JOIN</SectionLabel>
      <SurfaceCard style={styles.card}>
        <SettingsRow
          icon={ShieldCheck}
          title={DOMAIN_ONLY_TITLE}
          sub={DOMAIN_ONLY_SUB}
          testID="organization-domain-only"
          right={<NocToggle value={pending ?? on} disabled={busy} onChange={(next) => void change(next)} />}
        />
      </SurfaceCard>
      {/* Directly under the toggle: it names this row's failure. */}
      {error ? <ActionFailure message={error} retryLabel="Try again" onRetry={() => void change(attempted.current)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The 9 under a section label, as every labelled card on Settings sits.
  card: { marginTop: 9 },
});
