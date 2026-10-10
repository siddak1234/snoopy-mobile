import { PlayCircle } from 'phosphor-react-native';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RunFileField } from '@/components/automations/run-file-field';
import { InlineBoundary } from '@/components/dialog-boundary';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { SetupFieldRow, declaredValues } from '@/components/setup-field';
import { fonts, status, typeScale } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED, runRefusal } from '@/lib/content/refusals';
import { RUN_FORM_ERROR_TITLE } from '@/lib/content/screen-states';
import { createRun, type AutomationRunInputField, type Subscription } from '@/lib/platform/automations';
import type { CatalogEntry } from '@/lib/platform/catalog';

type StartRunProps = {
  subscriptionId: string;
  /** The workspace the screen loaded; the run is refused once it is not active. */
  shownWorkspaceId: string | null;
  runInput: AutomationRunInputField[];
  onStarted: (runId: string) => void;
};

/**
 * Whether the flow page offers its start controls — the Run button's rule
 * until 25.8.3, unchanged: only where a run can be honest, a live flow whose
 * automation is available and whose pinned version declares what a run needs
 * (ADR-0030). One that declares nothing gets no form, because the platform
 * could not check one.
 */
export function canStartRun(subscription: Subscription, entry: CatalogEntry | undefined, live: boolean): boolean {
  return live && (subscription.runInput ?? []).length > 0 && entry?.available === true;
}

/**
 * The flow page's start controls, at its top (BUILD-PLAN 25.8.3; the owner's
 * "i like the suggested lets do that"): the run's fields and Start run, in
 * place of the Run button and its dialog — what the website's Run window
 * holds, drawn on the page so a person can begin right from it. The
 * fields are the pinned version's `runInput` (backend ADR-0030, BUILD-PLAN
 * 24.4.1), drawn from the manifest, so no automation needs an app change.
 *
 * Inside `InlineBoundary` (25.8.1's guarantee, kept): the rows are drawn from
 * a manifest the platform may publish after this build shipped, and a row that
 * cannot be drawn ends in the failed form's words with Try again, never a white
 * screen. The boundary is around the whole form, its hooks included.
 *
 * Each start leaves the box fresh for the next run: the form is drawn anew —
 * the declared defaults, empty file fields and a new idempotency key — as the
 * dialog was by opening again.
 */
export function StartRun({ subscriptionId, shownWorkspaceId, runInput, onStarted }: StartRunProps) {
  const { palette } = useTheme();
  const [started, setStarted] = useState(0);
  return (
    <View testID="start-run">
      <SectionLabel>NEW RUN</SectionLabel>
      {/* The website's sentence (`snoopy/app/account/flows/AutomationActions.tsx`): a run
          at a busy flow is created and waits its turn (backend 25.2.10). */}
      <Text style={[styles.lead, { color: palette.neutral[400] }]}>
        Enter what this run needs. It starts when you submit, or waits its turn if this flow is busy, and its page shows each step as it happens.
      </Text>
      <InlineBoundary title={RUN_FORM_ERROR_TITLE}>
        <StartRunForm
          key={started}
          subscriptionId={subscriptionId}
          shownWorkspaceId={shownWorkspaceId}
          runInput={runInput}
          onStarted={(runId) => {
            setStarted((count) => count + 1);
            onStarted(runId);
          }}
        />
      </InlineBoundary>
    </View>
  );
}

/**
 * The form: the declared defaults, a key renewed whenever a value changes — so
 * only a resubmission of the same values, after a lost answer, reuses it and
 * the platform returns the run it already started instead of starting a second
 * — and Start run held while a file is uploading.
 */
function StartRunForm({ subscriptionId, shownWorkspaceId, runInput, onStarted }: StartRunProps) {
  const session = useSession();
  const keys = useIntentKeys('run');
  const [values, setValues] = useState<Record<string, unknown>>(() => declaredDefaults(runInput));
  const [uploading, setUploading] = useState<ReadonlySet<string>>(() => new Set());
  // Bumped to empty the file fields when the platform will not take a file.
  const [fileRound, setFileRound] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const change = useCallback(
    (key: string, value: unknown) => {
      setValues((previous) => ({ ...previous, [key]: value }));
      keys.settle();
    },
    [keys],
  );
  const onBusyChange = useCallback((key: string, isBusy: boolean) => {
    setUploading((current) => {
      if (isBusy === current.has(key)) return current;
      const next = new Set(current);
      if (isBusy) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const start = async () => {
    if (busy || uploading.size > 0) return;
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { run } = await createRun(workspaceId, subscriptionId, keys.keyFor(), declaredValues(runInput, values));
      keys.settle();
      onStarted(run.id);
    } catch (caught) {
      const refused = runRefusal(caught);
      setError(refused.message);
      if (refused.fileGone) {
        // A file already used, or gone: its field is emptied to choose again,
        // and the changed input is a new run.
        setValues((previous) => withoutFiles(runInput, previous));
        setFileRound((round) => round + 1);
        keys.settle();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SurfaceCard style={styles.card}>
        {runInput.map((field, index) => {
          const divider = index < runInput.length - 1;
          return field.control === 'artifact' ? (
            <RunFileField
              key={`${field.key}:${fileRound}`}
              field={field}
              shownWorkspaceId={shownWorkspaceId}
              subscriptionId={subscriptionId}
              onValue={change}
              onBusyChange={onBusyChange}
              divider={divider}
            />
          ) : (
            <SetupFieldRow
              key={field.key}
              // Not a file, by the branch: text, money, a toggle, an address — or a control newer than this build (25.8.1).
              field={field}
              value={values[field.key]}
              onChange={(next) => change(field.key, next)}
              divider={divider}
            />
          );
        })}
      </SurfaceCard>
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: status.err }]}>
          {error}
        </Text>
      ) : null}
      <PillButton
        testID="start-run-button"
        label={busy ? 'Starting…' : uploading.size > 0 ? 'Uploading…' : 'Start run'}
        variant="primary"
        height={46}
        fontSize={typeScale.label.fontSize}
        icon={PlayCircle}
        iconSize={16}
        disabled={busy || uploading.size > 0}
        style={styles.start}
        onPress={start}
      />
    </>
  );
}

/** Each field starts at the default its manifest declares; a file has none. */
function declaredDefaults(runInput: AutomationRunInputField[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of runInput) {
    if (field.control !== 'artifact' && field.defaultValue !== undefined) values[field.key] = field.defaultValue;
  }
  return values;
}

function withoutFiles(runInput: AutomationRunInputField[], values: Record<string, unknown>) {
  const next = { ...values };
  for (const field of runInput) if (field.control === 'artifact') delete next[field.key];
  return next;
}

const styles = StyleSheet.create({
  lead: { marginTop: 6, fontFamily: fonts.regular, ...typeScale.small },
  card: { marginTop: 9 },
  error: { marginTop: 10, fontFamily: fonts.regular, ...typeScale.small },
  start: { marginTop: 12 },
});
