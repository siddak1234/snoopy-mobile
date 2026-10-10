import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Dialog, DialogButton } from '@/components/dialog';
import { PillButton } from '@/components/nocturne/pill-button';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { fonts, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ERROR_BODY, TRY_AGAIN_LABEL } from '@/lib/content/screen-states';

/**
 * The error boundary around the Setup dialog (BUILD-PLAN 25.8.1, the owner's
 * requirement 1 of 2026-10-08: no app change per automation) — and, drawn on
 * its page as `InlineBoundary` below, around the run's form (25.8.3).
 *
 * Both draw rows from a manifest the platform publishes — possibly after this
 * build shipped — so what they draw is the one surface a new automation
 * reaches without a build. A row that could not be drawn used to be a thrown
 * render: React unmounts the tree up to the nearest boundary, the app had none,
 * and the dialog went with the screen (a crash in a release build). The throw
 * stops here instead. The dialog's place is taken by one in the failed-load
 * grammar — the thing that failed in its title, `ERROR_BODY` (the session kept,
 * nothing lost) — with Cancel and Try again, which draws the children again.
 * Nothing else: no log of a value (rule 6), no analytics; React reports the
 * error in development as it does any caught one.
 *
 * `Catch` is the class React requires of a boundary and holds no press of its
 * own: the presses are written here, in function components, so
 * `audit:presses` can follow them to the function each runs (a class's
 * `this.x` it cannot). Not a Nocturne primitive — it composes the shared
 * `Dialog`, `SurfaceCard` and `PillButton`, and nothing new.
 */
export function DialogBoundary({
  title,
  onClose,
  children,
}: {
  /** What failed, in the design's grammar: "Couldn't load this setup". */
  title: string;
  /** The dialog's own close: the failed dialog's Cancel is the caller's. */
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  // A new attempt keys a new `Catch`: its failed state and the children's state start over.
  const retry = () => setAttempt((count) => count + 1);
  return (
    <Catch key={attempt} fallback={<FailedDialog title={title} onClose={onClose} onRetry={retry} />}>
      {children}
    </Catch>
  );
}

/** The dialog drawn in place of one that threw: the standard failed-load words, Cancel, Try again. */
function FailedDialog({ title, onClose, onRetry }: { title: string; onClose: () => void; onRetry: () => void }) {
  return (
    <Dialog
      visible
      testID="dialog-failed"
      onRequestClose={onClose}
      title={title}
      body={ERROR_BODY}
      actions={
        <>
          <DialogButton label="Cancel" onPress={onClose} />
          <DialogButton tone="accent" label={TRY_AGAIN_LABEL} onPress={onRetry} />
        </>
      }
    />
  );
}

/**
 * The same boundary around a form drawn on its page rather than in a dialog —
 * the flow page's start controls (BUILD-PLAN 25.8.3), whose rows are the run's
 * fields from the manifest. The form's place is taken by a card in the same
 * words — the thing that failed, `ERROR_BODY` — with Try again, which draws the
 * form again; no Cancel, since nothing was opened that could be closed. The
 * rest of the page is untouched.
 */
export function InlineBoundary({ title, children }: { title: string; children: React.ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  // A new attempt keys a new `Catch`: its failed state and the children's state start over.
  const retry = () => setAttempt((count) => count + 1);
  return (
    <Catch key={attempt} fallback={<FailedCard title={title} onRetry={retry} />}>
      {children}
    </Catch>
  );
}

/** The card drawn in place of a form that threw: the standard failed-load words, Try again. */
function FailedCard({ title, onRetry }: { title: string; onRetry: () => void }) {
  const { palette } = useTheme();
  return (
    <View testID="form-failed" accessibilityRole="alert">
      <SurfaceCard style={styles.card}>
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.body, { color: palette.neutral[400] }]}>{ERROR_BODY}</Text>
        <PillButton
          label={TRY_AGAIN_LABEL}
          variant="secondary"
          height={40}
          fontSize={typeScale.body.fontSize}
          style={styles.retry}
          onPress={onRetry}
        />
      </SurfaceCard>
    </View>
  );
}

type CatchProps = { fallback: React.ReactNode; children: React.ReactNode };

/** React's boundary: a class with `getDerivedStateFromError`. It draws `fallback` once a child has thrown. */
class Catch extends React.Component<CatchProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): React.ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const styles = StyleSheet.create({
  card: { marginTop: 9, padding: 14, gap: 6 },
  title: { fontFamily: fonts.medium, fontSize: typeScale.label.fontSize },
  body: { fontFamily: fonts.regular, ...typeScale.small },
  retry: { marginTop: 6, alignSelf: 'flex-start' },
});
