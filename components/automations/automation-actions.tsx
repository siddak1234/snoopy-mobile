import { Archive, CaretRight, PlayCircle, SlidersHorizontal, WebhooksLogo, type Icon } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MoveVersion } from '@/components/automations/move-version';
import { RunDialog } from '@/components/automations/run-dialog';
import { SetupDialog } from '@/components/automations/setup-dialog';
import { WebhookAddressDialog } from '@/components/automations/webhook-address-dialog';
import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Pressable } from '@/components/pressable';
import { SettingsRow } from '@/components/settings/settings-row';
import { fonts, layout, typeScale, withAlpha } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useSolutions } from '@/hooks/use-solutions';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { updateSubscription, type Subscription } from '@/lib/platform/automations';
import type { CatalogEntry } from '@/lib/platform/catalog';

type Open = 'run' | 'setup' | 'webhook' | 'archive' | null;

/**
 * What a person can do with one flow, on the website's operations and by
 * its rules (BUILD-PLAN 24.4.1, `snoopy/app/account/automations`):
 *
 * - **Run** only where it can be honest: live, available, and a pinned version
 *   that declares what a run needs (ADR-0030). One that declares nothing gets
 *   no form, because the platform could not check one.
 * - **Set up** when the automation declares settings.
 * - **Move to vN** when the catalog has a newer version than the one pinned.
 * - **Webhook address** for a webhook-started version, owner or admin only.
 * - **Archive flow**, at the bottom and in red (BUILD-PLAN 24.9.4, the owner's
 *   feedback 5 of 2026-10-02; "Archive", not "Remove", since decision 4 of the
 *   same day, 24.12): the platform's one-way `archived`, behind its
 *   confirmation — it stops, moves to Archived flows, keeps its runs in
 *   Activity, and the flow can be unarchived later (the owner's build 12 item
 *   4: the word for adding it again). Pause keeps it listed.
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
  // A webhook secret's key, held here because its dialog is mounted only while
  // open: a press whose answer was lost is retried with its key after the dialog
  // is closed and opened again, as on the website (backend §12.1 #240).
  const webhookKeys = useIntentKeys('webhook');
  const [open, setOpen] = useState<Open>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const runInput = subscription.runInput ?? [];
  const canRun = live && runInput.length > 0 && entry?.available === true;
  // The settings of the version this flow RUNS, which the platform checks a save
  // against — not the catalog's newest, which differs once a version changes a
  // field (backend §12.1 #185). Absent when that version declares none.
  const setup = subscription.setup ?? [];
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
      setArchiveError(refusalMessage(caught, {}, 'The flow was not archived.'));
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
  ];

  return (
    <View style={styles.stack}>
      {canRun ? (
        <PillButton
          label="Run"
          variant="primary"
          height={46}
          fontSize={typeScale.label.fontSize}
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
          config={subscription.config}
          // Move is offered only to the catalog's newest, so its fields are the target's.
          targetSetup={entry?.setup ?? []}
          onMoved={onChanged}
        />
      ) : null}
      {rows.length > 0 ? (
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
                onPress={() => setOpen(row.open)}
                right={<CaretRight size={15} color={palette.neutral[500]} />}
              />
            ))}
          </SurfaceCard>
        </View>
      ) : null}

      {/* Last on the page, in red: the one-way action, where a person scrolls
          to find it rather than taps it by mistake (24.9.4). */}
      <Pressable
        testID="archive-flow"
        accessibilityRole="button"
        accessibilityLabel={`Archive ${name}`}
        onPress={() => {
          setArchiveError(null);
          setOpen('archive');
        }}
        style={({ pressed }) => [
          styles.archive,
          { borderColor: palette.danger },
          pressed && { backgroundColor: withAlpha(palette.danger, 0.08) },
        ]}>
        <Archive size={18} color={palette.danger} />
        <Text style={[styles.archiveLabel, { color: palette.danger }]}>Archive flow</Text>
      </Pressable>

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
        <WebhookAddressDialog
          subscriptionId={subscription.id}
          shownWorkspaceId={shownWorkspaceId}
          keys={webhookKeys}
          onClose={close}
        />
      ) : null}
      <Dialog
        visible={open === 'archive'}
        testID="archive-dialog"
        onRequestClose={archiving ? () => undefined : close}
        title={`Archive ${name}?`}
        body="It stops and moves to Archived flows. Its runs stay in Activity, and you can unarchive it later."
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
  archive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
    paddingVertical: 13,
    paddingHorizontal: layout.rowPadH,
    borderWidth: 1,
    borderRadius: 14,
  },
  archiveLabel: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label.fontSize,
  },
});
