import { useRouter } from 'expo-router';
import { Archive, CaretRight, SlidersHorizontal, WebhooksLogo } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { WebhookAddressDialog } from '@/components/automations/webhook-address-dialog';
import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { SectionTitle } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Pressable } from '@/components/pressable';
import { SettingsRow } from '@/components/settings/settings-row';
import { Text } from '@/components/text';
import { fonts, iconSize, layout, space, typeScale, withAlpha } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useSolutions } from '@/hooks/use-solutions';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { EDIT_SETUP_LABEL } from '@/lib/content/screen-states';
import { updateSubscription, type Subscription } from '@/lib/platform/automations';
import type { CatalogEntry } from '@/lib/platform/catalog';

type Open = 'webhook' | 'archive' | null;

/**
 * What a person can do with one flow, on the website's operations and by
 * its rules (BUILD-PLAN 24.4.1, `snoopy/app/account/automations`):
 *
 * - **Edit setup** when the version it runs declares settings or accounts:
 *   Set up again, the same page Add opened (Build 21; the owner's AM4: "they
 *   can have a edit settings/flow/setup thing in the bottom of the flow page
 *   in case they want to change how it was set up"; ~~Set up, a dialog over
 *   the page~~ until Build 21).
 * - ~~**the move to a newer version** when the catalog has one newer than
 *   the version pinned~~ until Build 22 (the owner's build 21 item 7: "I also dont want a
 *   move to vx number in the flows. The user always gets the latest version.
 *   They dont get to oick when to update"): the platform moves every flow to
 *   the newest version itself (backend ADR-0041).
 * - **Webhook address** for a webhook-started version, owner or admin only.
 * - **Archive flow**, at the bottom and in red (BUILD-PLAN 24.9.4, the owner's
 *   feedback 5 of 2026-10-02; "Archive", not "Remove", since decision 4 of the
 *   same day, 24.12): the platform's one-way `archived`, behind its
 *   confirmation — it stops, moves to Archived flows, keeps its runs in
 *   Activity, and the flow can be unarchived later (the owner's build 12 item
 *   4: the word for adding it again). Pause keeps it listed.
 *
 * Run is not here since BUILD-PLAN 25.8.3: the run's fields and Start run are
 * the flow page's start controls, at its top (`StartRun`).
 *
 * Every action acts on the workspace the screen loaded (`shownWorkspaceId`).
 * `statusRow` is the screen's own Go live / Pause row, placed first.
 */
export function AutomationActions({
  name,
  subscription,
  entry,
  shownWorkspaceId,
  canAdminister,
  statusRow,
  onArchived,
}: {
  name: string;
  subscription: Subscription;
  /** The catalog's entry for its template; absent once the template is withdrawn. */
  entry: CatalogEntry | undefined;
  shownWorkspaceId: string | null;
  canAdminister: boolean;
  statusRow: React.ReactNode;
  onArchived: () => void;
}) {
  const { palette } = useTheme();
  const router = useRouter();
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

  // The settings of the version this flow RUNS, which the platform checks a save
  // against — not the catalog's newest, which differs once a version changes a
  // field (backend §12.1 #185). Absent when that version declares none.
  const setup = subscription.setup ?? [];
  const setsUp = setup.length > 0 || (entry?.requiredConnections ?? []).length > 0;
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

  return (
    <View style={styles.stack}>
      {statusRow}
      {setsUp || webhook ? (
        <View>
          <SectionTitle>MANAGE</SectionTitle>
          <SurfaceCard>
            {setsUp ? (
              <SettingsRow
                testID="manage-setup"
                icon={SlidersHorizontal}
                title={EDIT_SETUP_LABEL}
                divider={webhook}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/flows/setup',
                    params: { template: subscription.templateId, flow: subscription.id },
                  })
                }
                right={<CaretRight size={15} color={palette.neutral[500]} />}
              />
            ) : null}
            {webhook ? (
              <SettingsRow
                testID="manage-webhook"
                icon={WebhooksLogo}
                title="Webhook address"
                sub="Where a service sends the events that start it"
                onPress={() => setOpen('webhook')}
                right={<CaretRight size={15} color={palette.neutral[500]} />}
              />
            ) : null}
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
        <Archive size={iconSize.button} color={palette.danger} />
        <Text style={[styles.archiveLabel, { color: palette.danger }]}>Archive flow</Text>
      </Pressable>

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
    gap: space.group,
  },
  card: {
    marginTop: space.title,
  },
  archive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.inner,
    marginTop: space.inner,
    paddingVertical: space.rowY,
    paddingHorizontal: layout.rowPadH,
    borderWidth: 1,
    borderRadius: 14,
  },
  archiveLabel: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label.fontSize,
  },
});
