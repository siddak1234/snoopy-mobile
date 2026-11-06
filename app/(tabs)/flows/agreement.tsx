import { useLocalSearchParams, useRouter } from 'expo-router';
import { ShieldCheck } from 'phosphor-react-native';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NocToggle } from '@/components/nocturne/noc-toggle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { TextField } from '@/components/nocturne/text-field';
import { Page } from '@/components/page';
import { PageHeader } from '@/components/page-header';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { SettingsRow } from '@/components/settings/settings-row';
import { Text } from '@/components/text';
import { fonts, space, status, typeScale } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { roleIn, useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import {
  AGREEMENT_NOT_PUBLISHED,
  AGREEMENT_TITLE,
  ASK_OWNER_TO_ACCEPT,
  SIGNER_NAME_LABEL,
  SIGNER_TITLE_LABEL,
  agreementVersion,
  authorizedFor,
} from '@/lib/content/health-agreement';
import { WORKSPACE_CHANGED } from '@/lib/content/refusals';
import { errorTitleFor } from '@/lib/content/screen-states';
import { acceptHealthDataAgreement, readHealthDataAgreement, type HealthDataAgreement } from '@/lib/platform/agreements';
import { PlatformError } from '@/lib/platform/problem';
import { SIGNER_FIELD_LIMIT, acceptLabel, acceptanceRefusal, settleAgreement } from '@/lib/view/health-agreement';

/**
 * The health data agreement (Round 21 stage 2, C3; backend ADR-0049) — the
 * website's dialog, as a screen of the Flows tab, of Home's
 * (`app/(tabs)/(home)/agreement.tsx`) for Home's YOUR FLOWS, and of Settings'
 * (`app/(tabs)/settings/agreement.tsx`) for the flow page Settings opens. Opened only for
 * the workspace's owner, when a flow that carries health data was refused 403
 * `agreement_required` at a run's start (Start run, an item's upload;
 * `action: run`) or at a turn-on on its own page (the flow page's Turn on;
 * `action: turn-on`, ADR-0049 amendment 2), for the workspace that refused it
 * (`workspace`). ~~At its add, from Set up's Turn on~~ until builds 37 and 39,
 * wave 2: Set up accepts in its own "Contract and accept" section
 * (`components/flows/contract-step.tsx`).
 *
 * The title and the version over the text (`GET /v1/agreements/health-data`,
 * read when the screen opens) to scroll; the checkbox "I'm authorized to sign
 * for {organization}" — the app's switch, as every yes or no here is; "Full
 * name" and "Title", each at most 120 characters (the contract's bound); then "Accept and start run"
 * ("Accept and turn on" for a turn-on; `acceptLabel`), pressable once all
 * three are given, "Starting…" ("Turning on…") while it sends, the website's
 * words. It accepts (`POST …/agreements`, the version and sha256 read), then
 * goes back, and the screen that was refused sends its run or its turn-on
 * again with the same key (`lib/view/health-agreement.ts`). Back without
 * accepting sends nothing.
 *
 * Not published (503 `agreement_not_published`): "The health data agreement
 * isn't available yet." Anyone but the owner: "Ask your workspace owner to
 * accept the health data agreement." An acceptance refused says the same two
 * lines — 403, no longer the owner; 503, none published — never the platform's
 * title (`acceptanceRefusal`). A text changed since it was read (409
 * `agreement_changed`) is read again, and the checkbox asked again.
 */
export default function AgreementScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const session = useSession();
  const { action, workspace } = useLocalSearchParams<{ action?: string; workspace?: string }>();
  const keys = useIntentKeys('agreement');
  const [authorized, setAuthorized] = useState(false);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Left without accepting (Back, a swipe): the screen that was refused is told, and sends nothing.
  useEffect(() => () => settleAgreement(false), []);

  const resource = useWorkspaceResource(async () => ({ agreement: await readHealthDataAgreement().catch(unpublished) }));

  if (resource.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (resource.status === 'offline') {
    return <ScreenOffline onRetry={() => resource.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (resource.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor(undefined)} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (resource.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor(undefined)}
        onRetry={() => resource.reload()}
        body={busyBody(resource)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const { agreement } = resource.data;
  const owner = roleIn(session, resource.loadedFor) === 'owner';
  const organization =
    session.status === 'signed-in'
      ? (session.session.workspaces.find((each) => each.id === resource.loadedFor)?.name ?? '')
      : '';
  const ready = authorized && name.trim() !== '' && title.trim() !== '';
  const muted = { color: palette.neutral[400] };

  /** A changed value is a new acceptance: its key is new too. */
  const change = (set: (value: string) => void) => (value: string) => {
    set(value);
    keys.settle();
  };

  const accept = async (current: HealthDataAgreement) => {
    if (busy || !ready) return;
    const workspaceId = workspaceIfShown(session, resource.loadedFor);
    if (!workspaceId || (workspace !== undefined && workspace !== workspaceId)) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await acceptHealthDataAgreement(workspaceId, current, { name: name.trim(), title: title.trim() }, keys.keyFor());
      keys.settle();
      settleAgreement(true);
      router.back();
    } catch (caught) {
      if (caught instanceof PlatformError && caught.status === 409 && caught.details?.reason === 'agreement_changed') {
        // Another text is current: it is read again, and confirmed again before it is accepted.
        keys.settle();
        setAuthorized(false);
        resource.reload();
        return;
      }
      setError(acceptanceRefusal(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets testID="agreement-screen">
      <PageHeader
        onBack={() => router.back()}
        title={AGREEMENT_TITLE}
        subtitle={agreement && owner ? agreementVersion(agreement.version) : null}
        subtitleTestID="agreement-version"
      />
      {!agreement || !owner ? (
        <SurfaceCard style={styles.note}>
          <Text testID="agreement-line" style={[styles.text, muted]}>
            {agreement ? ASK_OWNER_TO_ACCEPT : AGREEMENT_NOT_PUBLISHED}
          </Text>
        </SurfaceCard>
      ) : (
        <>
          <SurfaceCard style={styles.note}>
            <Text testID="agreement-text" style={[styles.text, { color: palette.text }]}>
              {agreement.text}
            </Text>
          </SurfaceCard>
          <SurfaceCard>
            <SettingsRow
              icon={ShieldCheck}
              title={authorizedFor(organization)}
              testID="agreement-authorized"
              right={
                <NocToggle
                  value={authorized}
                  disabled={busy}
                  onChange={(next) => {
                    setAuthorized(next);
                    keys.settle();
                  }}
                />
              }
            />
          </SurfaceCard>
          <View style={styles.fields}>
            <TextField
              label={SIGNER_NAME_LABEL}
              value={name}
              onChangeText={change(setName)}
              autoComplete="name"
              maxLength={SIGNER_FIELD_LIMIT}
            />
            <TextField label={SIGNER_TITLE_LABEL} value={title} onChangeText={change(setTitle)} maxLength={SIGNER_FIELD_LIMIT} />
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: status.err }]}>
              {error}
            </Text>
          ) : null}
          <PillButton
            testID="agreement-accept"
            label={acceptLabel(action, busy)}
            variant="primary"
            disabled={busy || !ready}
            onPress={() => void accept(agreement)}
          />
        </>
      )}
    </Page>
  );
}

/** No version published: the screen says so, rather than failing to load. Any other refusal is the read's. */
function unpublished(error: unknown): null {
  if (error instanceof PlatformError && error.status === 503 && error.details?.reason === 'agreement_not_published') {
    return null;
  }
  throw error;
}

const styles = StyleSheet.create({
  note: { padding: space.card },
  text: { fontFamily: fonts.regular, ...typeScale.body },
  fields: { gap: space.inner },
  error: { fontFamily: fonts.regular, ...typeScale.small },
});
