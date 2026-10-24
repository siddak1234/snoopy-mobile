import { PlayCircle } from 'phosphor-react-native';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RunFileField } from '@/components/automations/run-file-field';
import { InlineBoundary } from '@/components/dialog-boundary';
import { PillButton } from '@/components/nocturne/pill-button';
import { SetupFieldRow, declaredValues } from '@/components/setup-field';
import { Text } from '@/components/text';
import { fonts, iconSize, status, typeScale } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
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
  /**
   * Drawn in place of Start run — the flow page's Turn on while the flow is not
   * live (Build 21, spec A6): the fields stay, so a file given first is kept.
   */
  action?: React.ReactNode;
  /**
   * The item the run belongs to, on a flow with items (backend ADR-0046): the
   * item page's form, which says Start (plan §5.3).
   */
  itemId?: string;
  startLabel?: string;
  /** Its file fields say their types under their titles (the item page, as the website's). */
  showTypes?: boolean;
};

/**
 * Whether the flow page offers Start run — the Run button's rule until 25.8.3,
 * unchanged: only where a run can be honest, a live flow whose automation is
 * available and whose pinned version declares what a run needs (ADR-0030). One
 * that declares nothing gets no form, because the platform could not check one.
 */
export function canStartRun(subscription: Subscription, entry: CatalogEntry | undefined, live: boolean): boolean {
  return live && (subscription.runInput ?? []).length > 0 && entry?.available === true;
}

/**
 * Step 1 of the flow page (Build 21, spec A6; the owner's D3: "it should be easy
 * for a user to run something"): the run's fields — titles only, no line under
 * them — and Start run, inside the step that receives the document. Since
 * 25.8.3 they are the page's start controls in place of the Run button and its
 * dialog; since Build 21 they sit in Step 1 rather than under a NEW RUN label
 * with a lead line. The fields are the pinned version's `runInput` (backend
 * ADR-0030), drawn from the manifest, so no flow needs an app change.
 *
 * Inside `InlineBoundary` (25.8.1's guarantee, kept): a row that cannot be drawn
 * ends in the failed form's words with Try again, never a white screen.
 *
 * Each start leaves the box fresh for the next run: the form is drawn anew —
 * the declared defaults, empty file fields and a new idempotency key.
 *
 * ~~A run with a file waited on the account's one-time answer about document
 * reading~~ — gone with the owner's D1 of 2026-10-15: "we dont need to say
 * this at all … the terms and privacy policy includes that information". A run
 * starts at the press.
 */
export function StartRun({
  subscriptionId,
  shownWorkspaceId,
  runInput,
  onStarted,
  action,
  itemId,
  startLabel,
  showTypes,
}: StartRunProps) {
  const [started, setStarted] = useState(0);
  return (
    <View testID="start-run">
      <InlineBoundary title={RUN_FORM_ERROR_TITLE}>
        <StartRunForm
          key={started}
          subscriptionId={subscriptionId}
          shownWorkspaceId={shownWorkspaceId}
          runInput={runInput}
          action={action}
          itemId={itemId}
          startLabel={startLabel}
          showTypes={showTypes}
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
function StartRunForm({
  subscriptionId,
  shownWorkspaceId,
  runInput,
  onStarted,
  action,
  itemId,
  startLabel,
  showTypes,
}: StartRunProps) {
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

  /** Start run: the run, with what the form holds. */
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
      const { run } = await createRun(workspaceId, subscriptionId, keys.keyFor(), declaredValues(runInput, values), itemId);
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
            showTypes={showTypes}
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
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: status.err }]}>
          {error}
        </Text>
      ) : null}
      <View style={styles.start}>
        {action ?? (
          <PillButton
            testID="start-run-button"
            label={busy ? 'Starting…' : uploading.size > 0 ? 'Uploading…' : (startLabel ?? 'Start run')}
            variant="primary"
            height={46}
            fontSize={typeScale.label.fontSize}
            icon={PlayCircle}
            iconSize={iconSize.button}
            disabled={busy || uploading.size > 0}
            onPress={start}
          />
        )}
      </View>
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
  error: { marginTop: 4, paddingHorizontal: 14, fontFamily: fonts.regular, ...typeScale.small },
  start: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14 },
});
