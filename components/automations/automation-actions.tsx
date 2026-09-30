import { Archive, CaretRight, PlayCircle, SlidersHorizontal, WebhooksLogo, type Icon } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MoveVersion } from '@/components/automations/move-version';
import { RunDialog } from '@/components/automations/run-dialog';
import { SetupDialog } from '@/components/automations/setup-dialog';
import { WebhookAddressDialog } from '@/components/automations/webhook-address-dialog';
import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { SettingsRow } from '@/components/settings/settings-row';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useSolutions } from '@/hooks/use-solutions';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { updateSubscription, type Subscription } from '@/lib/platform/automations';
import type { CatalogEntry } from '@/lib/platform/catalog';

type Open = 'run' | 'setup' | 'webhook' | 'archive' | null;

/**
 * What a person can do with one workflow, on the website's operations and by
 * its rules (BUILD-PLAN 24.4.1, `snoopy/app/account/automations`):
 *
 * - **Run** only where it can be honest: live, available, and a pinned version
 *   that declares what a run needs (ADR-0030). One that declares nothing gets
 *   no form, because the platform could not check one.
 * - **Set up** when the automation declares settings.
 * - **Move to vN** when the catalog has a newer version than the one pinned.
 * - **Webhook address** for a webhook-started version, owner or admin only.
 * - **Archive**, one-way, behind its confirmation — its own action, so the
 *   irreversible transition is reachable no other way.
 *
 * Every action acts on the workspace the screen loaded (`shownWorkspaceId`).
 * `statusRow` is the screen's own Go live / Pause row, placed after Run.
 */
export function AutomationActions({
  name,
  subscription,
  entry,
  live,
  shownWorkspaceId,
  canAdminister,
  statusRow,
  onChanged,
  onArchived,
  onRunStarted,
}: {
  name: string;
  subscription: Subscription;
  /** The catalog's entry for its template; absent once the template is withdrawn. */
  entry: CatalogEntry | undefined;
  /** Whether it is live now, as the screen shows it. */
  live: boolean;
  shownWorkspaceId: string | null;
  canAdminister: boolean;
  statusRow: React.ReactNode;
  onChanged: () => void;
  onArchived: () => void;
  onRunStarted: (runId: string) => void;
}) {
  const { palette } = useTheme();
  const session = useSession();
  const { forget } = useSolutions();
  const archiveKeys = useIntentKeys('archive');
  const [open, setOpen] = useState<Open>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const runInput = subscription.runInput ?? [];
  const canRun = live && runInput.length > 0 && entry?.available === true;
  const setup = entry?.setup ?? [];
  const newer = entry && subscription.templateVersion < entry.version ? entry.version : null;
  const webhook = subscription.triggerKind === 'webhook' && canAdminister;
  const close = () => setOpen(null);

  const archive = async () => {
    if (archiving) return;
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) {
      setArchiveError(WORKSPACE_CHANGED);
      return;
    }
    setArchiving(true);
    setArchiveError(null);
    try {
      await updateSubscription(workspaceId, subscription.id, { status: 'archived' }, archiveKeys.keyFor());
      archiveKeys.settle();
      // Whatever this device said about its plan membership, the list decides now.
      forget(subscription.templateId);
      setOpen(null);
      onArchived();
    } catch (caught) {
      setArchiveError(refusalMessage(caught, {}, 'The automation was not archived.'));
    } finally {
      setArchiving(false);
    }
  };

  const rows: { key: string; icon: Icon; title: string; sub: string; open: Exclude<Open, null> }[] = [
    ...(setup.length > 0
      ? [{ key: 'setup', icon: SlidersHorizontal, title: 'Set up', sub: 'The settings it runs with', open: 'setup' as const }]
      : []),
    ...(webhook
      ? [{ key: 'webhook', icon: WebhooksLogo, title: 'Webhook address', sub: 'Where a service sends the events that start it', open: 'webhook' as const }]
      : []),
    { key: 'archive', icon: Archive, title: 'Archive', sub: 'Stop it for good and give its plan slot back', open: 'archive' },
  ];

  return (
    <View style={styles.stack}>
      {canRun ? (
        <PillButton
          label="Run"
          variant="primary"
          height={46}
          fontSize={14}
          icon={PlayCircle}
          iconSize={16}
          onPress={() => setOpen('run')}
        />
      ) : null}
      {statusRow}
      {newer !== null ? (
        <MoveVersion
          name={name}
          subscriptionId={subscription.id}
          shownWorkspaceId={shownWorkspaceId}
          from={subscription.templateVersion}
          to={newer}
          onMoved={onChanged}
        />
      ) : null}
      <View>
        <SectionLabel>MANAGE</SectionLabel>
        <SurfaceCard style={styles.card}>
          {rows.map((row, index) => (
            <SettingsRow
              key={row.key}
              testID={`manage-${row.key}`}
              icon={row.icon}
              title={row.title}
              sub={row.sub}
              divider={index < rows.length - 1}
              onPress={() => {
                setArchiveError(null);
                setOpen(row.open);
              }}
              right={<CaretRight size={15} color={palette.neutral[500]} />}
            />
          ))}
        </SurfaceCard>
      </View>

      {open === 'run' ? (
        <RunDialog
          name={name}
          subscriptionId={subscription.id}
          shownWorkspaceId={shownWorkspaceId}
          runInput={runInput}
          onClose={close}
          onStarted={(runId) => {
            close();
            onRunStarted(runId);
          }}
        />
      ) : null}
      {open === 'setup' ? (
        <SetupDialog
          subscriptionId={subscription.id}
          shownWorkspaceId={shownWorkspaceId}
          setup={setup}
          config={subscription.config}
          onClose={close}
          onSaved={() => {
            close();
            onChanged();
          }}
        />
      ) : null}
      {open === 'webhook' ? (
        <WebhookAddressDialog subscriptionId={subscription.id} shownWorkspaceId={shownWorkspaceId} onClose={close} />
      ) : null}
      <Dialog
        visible={open === 'archive'}
        testID="archive-dialog"
        onRequestClose={archiving ? () => undefined : close}
        title={`Archive ${name}?`}
        body="It stops running and gives its plan slot back. This cannot be undone: to use it again, add it afresh. Runs it already made stay in Activity."
        actions={
          <>
            <DialogButton label="Cancel" disabled={archiving} onPress={close} />
            <DialogButton
              tone="danger"
              disabled={archiving}
              onPress={archive}
              label={archiving ? 'Archiving…' : 'Archive'}
            />
          </>
        }>
        {archiveError ? <DialogText tone="error">{archiveError}</DialogText> : null}
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  card: {
    marginTop: 9,
  },
});
