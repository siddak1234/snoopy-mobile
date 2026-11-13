import { PlayCircle } from 'phosphor-react-native';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RunFileField, RunFilesField } from '@/components/automations/run-file-field';
import { InlineBoundary } from '@/components/dialog-boundary';
import { PillButton } from '@/components/nocturne/pill-button';
import { SetupFieldRow, declaredValues } from '@/components/setup-field';
import { Text } from '@/components/text';
import { fonts, iconSize, space, status, typeScale } from '@/constants/theme';
import { useHealthAgreement } from '@/hooks/use-health-agreement';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { WORKSPACE_CHANGED, runRefusal } from '@/lib/content/refusals';
import { RUN_FORM_ERROR_TITLE, addFileFirst } from '@/lib/content/screen-states';
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
  /** Home's quick-access card alone (build 42 item 16): see `StartRun`. */
  compact?: boolean;
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
 * A run refused for the health data agreement (Round 21 stage 2, C3): the
 * owner accepts it on its own screen, then the run is sent again with the same
 * key; anyone else is told who can (`useHealthAgreement`).
 *
 * ~~A run with a file waited on the account's one-time answer about document
 * reading~~ — gone with the owner's D1 of 2026-10-15: "we dont need to say
 * this at all … the terms and privacy policy includes that information". A run
 * starts at the press.
 *
 * Several files (Round 21 platform round 2, B2 as the batch addendum amends
 * it): a file field with `multiple` (`RunFilesField`) holds several, and Start
 * run uploads every one into ONE run — the field's value the list of their ids
 * (`declaredValues`), one start-run call, one key — never a run per file. ~~One
 * run per file and "{n} runs started"~~ until the batch addendum. A flow that
 * declares `batch` splits that run into units on the platform; its page draws
 * them (the run page's `batch` part).
 *
 * **`compact`**, Home's quick-access card alone (the owner's build 42 item 16:
 * "See how this can be re formatted with the same style and buttons to reduce
 * the real estate"): Start reads "Start" (said "Start run" while idle;
 * "Starting…" / "Uploading…" as ever while held), and the Start and error rows
 * lose their padding, the card's own. A run input of exactly one file field
 * draws that field `compact` with Start at the end of its buttons' row — Take
 * photo, Upload, Start on one wrapping row, no title line — and no Start row of
 * its own; any other input keeps its fields as here, then the compact Start.
 * The flow page's Step 1 and the item page pass no `compact`: unchanged.
 * Since the owner's build 43 item 17 ("for the compact card i want two
 * buttons … upload start"): that row is Upload and Start — Take photo inside
 * Upload's menu — and Start is `filled`, the one filled button (the owner's
 * decision of 2026-11-13); ~~Take photo, Upload, Start~~ until build 43. The
 * flow page's and the item page's Start stay `primary`, the outline.
 *
 * **A required file missing** (build 43 item 17: "start throws an error rather
 * than starting if nothing was uploaded when required … ensure this is a
 * standard"), in every start form: Start first finds the first `artifact` field
 * with `required: true` that holds no file (`missingFile`); then the form's one
 * error line says "Add {title} first." and nothing is sent — Start is never
 * disabled for it. The line goes when an upload starts and comes back at the
 * next press while the file is still missing. An optional file left empty, and
 * every other control, as before; Turn on (`action`) is no start, no check.
 * Each file a field holds is a pill with an x (`removable`), the x taking it
 * out of the run — a changed input, so a new key.
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
  compact,
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
          compact={compact}
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
  compact = false,
}: StartRunProps) {
  const session = useSession();
  const keys = useIntentKeys('run');
  const healthAgreement = useHealthAgreement();
  const [values, setValues] = useState<Record<string, unknown>>(() => declaredDefaults(runInput));
  const [uploading, setUploading] = useState<ReadonlySet<string>>(() => new Set());
  // Bumped to empty the file fields when the platform will not take a file.
  const [fileRound, setFileRound] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // "Add {title} first." (build 43 item 17): shown in the error line's place until an upload starts.
  const [missing, setMissing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const change = useCallback(
    (key: string, value: unknown) => {
      setValues((previous) => ({ ...previous, [key]: value }));
      keys.settle();
    },
    [keys],
  );
  const onBusyChange = useCallback((key: string, isBusy: boolean) => {
    if (isBusy) setMissing(null);
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
    setMissing(null);
    const lacking = missingFile(runInput, values);
    if (lacking) {
      // Nothing is sent; the platform's 422 (`validateRunInput`) stays the backstop.
      setError(null);
      setMissing(addFileFirst(lacking.title));
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
      const { run } = await createRun(workspaceId, subscriptionId, keys.keyFor(), declaredValues(runInput, values), itemId);
      keys.settle();
      onStarted(run.id);
    } catch (caught) {
      // A flow that carries health data (C3): the owner accepts the agreement, then the run is sent again, its key the same.
      const agreement = await healthAgreement(caught, workspaceId);
      if (agreement) {
        if (agreement.accepted) await start();
        else setError(agreement.line);
        return;
      }
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

  const held = busy || uploading.size > 0;
  const startButton = action ?? (
    <PillButton
      testID="start-run-button"
      label={busy ? 'Starting…' : uploading.size > 0 ? 'Uploading…' : (startLabel ?? (compact ? 'Start' : 'Start run'))}
      // Home's shorter "Start" is still said in full while it can be pressed.
      accessibilityLabel={compact && !held ? 'Start run' : undefined}
      // The quick-access card's Start alone is filled (the owner's decision of 2026-11-13).
      variant={compact ? 'filled' : 'primary'}
      fontSize={typeScale.label.fontSize}
      icon={PlayCircle}
      iconSize={iconSize.button}
      disabled={held}
      style={compact ? styles.startGrow : undefined}
      onPress={start}
    />
  );
  // Home's card with one file field: Start goes at the end of the field's buttons' row.
  const inRow = compact && runInput.length === 1 && runInput[0]!.control === 'artifact';

  return (
    <>
      {runInput.map((field, index) => {
        const divider = index < runInput.length - 1;
        const trailing = inRow ? startButton : undefined;
        if (field.control === 'artifact' && field.multiple) {
          return (
            <RunFilesField
              key={`${field.key}:${fileRound}`}
              field={field}
              shownWorkspaceId={shownWorkspaceId}
              subscriptionId={subscriptionId}
              onValue={change}
              onBusyChange={onBusyChange}
              divider={divider}
              showTypes={showTypes}
              compact={inRow}
              trailing={trailing}
            />
          );
        }
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
            compact={inRow}
            trailing={trailing}
            removable
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
      {(missing ?? error) ? (
        <Text accessibilityRole="alert" style={[compact ? styles.errorFlush : styles.error, { color: status.err }]}>
          {missing ?? error}
        </Text>
      ) : null}
      {inRow ? null : <View style={compact ? styles.startFlush : styles.start}>{startButton}</View>}
    </>
  );
}

/**
 * The first required file field, in run-input order, that holds no file — no
 * id, `''` or an empty list — or null (build 43 item 17). Pure, so the rule is
 * tested on its own; an optional file field is never missing.
 */
export function missingFile(
  runInput: readonly AutomationRunInputField[],
  values: Record<string, unknown>,
): AutomationRunInputField | null {
  for (const field of runInput) {
    if (field.control !== 'artifact' || field.required !== true) continue;
    const value = values[field.key];
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return field;
  }
  return null;
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
  error: { marginTop: space.inner, paddingHorizontal: space.rowX, fontFamily: fonts.regular, ...typeScale.small },
  start: { paddingHorizontal: space.rowX, paddingTop: space.inner, paddingBottom: space.card },
  // Home's card (build 42 item 16): the card pads; its rows add none.
  errorFlush: { marginTop: space.inner, fontFamily: fonts.regular, ...typeScale.small },
  startFlush: { flexDirection: 'row' },
  startGrow: { flexGrow: 1 },
});
