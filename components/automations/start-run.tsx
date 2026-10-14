import { PlayCircle } from 'phosphor-react-native';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AiReadingCard } from '@/components/ai-reading-card';
import { RunFileField } from '@/components/automations/run-file-field';
import { InlineBoundary } from '@/components/dialog-boundary';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { SetupFieldRow, declaredValues } from '@/components/setup-field';
import { fonts, iconSize, status, typeScale } from '@/constants/theme';
import { useAiReading } from '@/hooks/use-ai-reading';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED, runRefusal } from '@/lib/content/refusals';
import { AI_READING_OFF, AI_READING_SETTING_FAILED, AI_READING_TURN_ON } from '@/lib/content/ai-reading';
import { RUN_FORM_ERROR_TITLE, START_RUN_LEAD } from '@/lib/content/screen-states';
import { createRun, type AutomationRunInputField, type Subscription } from '@/lib/platform/automations';
import type { CatalogEntry } from '@/lib/platform/catalog';

type StartRunProps = {
  subscriptionId: string;
  /** The workspace the screen loaded; the run is refused once it is not active. */
  shownWorkspaceId: string | null;
  runInput: AutomationRunInputField[];
  /**
   * The flow may send a run's file to AI (`AutomationCatalogEntry.usesAi`,
   * backend ADR-0038): a run with a file asks the account's answer first.
   */
  usesAi: boolean;
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
 *
 * A run that carries a file, on a flow that uses AI, follows the account's
 * answer to "AI reads your documents" (backend ADR-0038; the spec's §3.H): it
 * starts when allowed; never asked, the card asks first, and Allow starts it;
 * declined, "AI reading is off." with Turn on under Start run. The per-run
 * dialog of 2026-10-13 is gone with it (the owner's build 19 item 4).
 */
export function StartRun({ subscriptionId, shownWorkspaceId, runInput, usesAi, onStarted }: StartRunProps) {
  const { palette } = useTheme();
  const [started, setStarted] = useState(0);
  return (
    <View testID="start-run">
      <SectionLabel>NEW RUN</SectionLabel>
      {/* One line (spec §3.D; ~~the 28-word lead~~ until 2026-10-14). */}
      <Text style={[styles.lead, { color: palette.neutral[400] }]}>{START_RUN_LEAD}</Text>
      <InlineBoundary title={RUN_FORM_ERROR_TITLE}>
        <StartRunForm
          key={started}
          subscriptionId={subscriptionId}
          shownWorkspaceId={shownWorkspaceId}
          runInput={runInput}
          usesAi={usesAi}
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
 * — and Start run held while a file is uploading, or while the card asking the
 * account about AI is open.
 */
function StartRunForm({ subscriptionId, shownWorkspaceId, runInput, usesAi, onStarted }: StartRunProps) {
  const { palette } = useTheme();
  const session = useSession();
  const reading = useAiReading();
  const keys = useIntentKeys('run');
  const [values, setValues] = useState<Record<string, unknown>>(() => declaredDefaults(runInput));
  const [uploading, setUploading] = useState<ReadonlySet<string>>(() => new Set());
  // Bumped to empty the file fields when the platform will not take a file.
  const [fileRound, setFileRound] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The consent is open: no run starts until it is answered.
  const [asking, setAsking] = useState(false);

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

  /** The run, with what the form holds — what Start run sent before the consent, unchanged. */
  const begin = async () => {
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
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
    }
  };

  // The account's answer gates only a run that gives AI a file on a flow that uses it.
  const gated = usesAi && carriesFile(runInput, values);
  const off = usesAi && reading.choice === 'declined';

  /**
   * Start run. A run with a file, on a flow that uses AI, follows the account's
   * answer: allowed, it starts; never asked, the card asks first; declined, it
   * does not start — the line under the button says why, with Turn on. Any
   * other run starts as it always did.
   */
  const start = async () => {
    if (busy || asking || uploading.size > 0) return;
    if (gated && reading.choice === null) {
      setAsking(true);
      return;
    }
    if (gated && reading.choice === 'declined') return;
    setBusy(true);
    try {
      await begin();
    } finally {
      setBusy(false);
    }
  };

  /** The card answered: Allow starts the run; Not now leaves the form as it is. */
  const answered = async (choice: 'allowed' | 'declined') => {
    setAsking(false);
    if (choice !== 'allowed') return;
    setBusy(true);
    try {
      await begin();
    } finally {
      setBusy(false);
    }
  };

  /** "Turn on" under a declined answer: AI reading allowed on the account, then the run, when it has a file. */
  const turnOn = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await reading.save('allowed');
      if (gated) await begin();
    } catch {
      setError(AI_READING_SETTING_FAILED);
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
        iconSize={iconSize.button}
        disabled={busy || asking || uploading.size > 0}
        style={styles.start}
        onPress={start}
      />
      {off ? (
        <View testID="ai-reading-off" style={styles.off}>
          <Text style={[styles.offLine, { color: palette.neutral[400] }]}>{AI_READING_OFF}</Text>
          <PillButton
            testID="ai-reading-turn-on"
            label={AI_READING_TURN_ON}
            variant="secondary"
            height={40}
            fontSize={typeScale.body.fontSize}
            disabled={busy}
            onPress={turnOn}
          />
        </View>
      ) : null}
      {asking ? <AiReadingCard onAnswered={answered} onDismiss={() => setAsking(false)} /> : null}
    </>
  );
}

/** Whether the run's input carries a file: a file field holding the id of the one given, as `declaredValues` sends it. */
function carriesFile(runInput: AutomationRunInputField[], values: Record<string, unknown>): boolean {
  const input = declaredValues(runInput, values);
  return runInput.some((field) => field.control === 'artifact' && field.key in input);
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
  off: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  offLine: { flex: 1, fontFamily: fonts.regular, ...typeScale.small },
});
