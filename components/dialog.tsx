import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/pressable';
import { fonts, layout, status, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The app's one dialog: a sheet that fades in over the design's overlay, with a
 * title, its words and a row of actions.
 *
 * Settings drew this twice inline — the connection dialog and the workspace
 * switcher — with the same overlay, card, type and buttons. It is named once so
 * the confirmations Round 16 adds (archive, remove, delete) draw the same thing
 * rather than a third copy (BUILD-PLAN 24.3.8). Not a Nocturne primitive: the
 * design set has no dialog, and this composes theme tokens only.
 *
 * Forms live in it (a run's input, setup, a pasted key), so on iOS it rises
 * above the keyboard rather than hiding its own buttons under it. Two actions
 * sit in a row; a dialog with three asks for `actionsLayout="stack"`, which
 * lays them out one under another at full width — the wrapped row put the
 * third button alone on a second line, right-aligned, which the owner read as
 * a broken layout (24.7.3 attempt 1, feedback #2).
 */
export function Dialog({
  visible,
  onRequestClose,
  title,
  body,
  testID,
  children,
  actions,
  actionsLayout = 'row',
}: {
  visible: boolean;
  onRequestClose: () => void;
  title: React.ReactNode;
  body?: React.ReactNode;
  testID?: string;
  children?: React.ReactNode;
  actions: React.ReactNode;
  /** `stack` for three or more actions: one under another, full width. */
  actionsLayout?: 'row' | 'stack';
}) {
  const { palette } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.overlay, { backgroundColor: status.overlay }]}>
        <View
          testID={testID}
          style={[styles.dialog, { backgroundColor: palette.surface, borderColor: palette.neutral[800] }]}>
          <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
          {body ? <DialogText>{body}</DialogText> : null}
          {children}
          <View
            testID={testID ? `${testID}-actions` : undefined}
            style={actionsLayout === 'stack' ? styles.actionsStacked : styles.actions}>
            {actions}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A dialog's words: muted, or the error colour for what did not happen. */
export function DialogText({
  children,
  tone = 'muted',
  testID,
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'error';
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <Text
      testID={testID}
      style={[styles.body, { color: tone === 'error' ? status.err : palette.neutral[400] }]}>
      {children}
    </Text>
  );
}

/** One action. `danger` is for what cannot be undone, in `palette.danger`; `accent` for the way on. */
export function DialogButton({
  label,
  onPress,
  disabled,
  tone = 'neutral',
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'accent' | 'danger';
  testID?: string;
}) {
  const { palette } = useTheme();
  const color = tone === 'danger' ? palette.danger : tone === 'accent' ? palette.accent : palette.text;
  const border = tone === 'danger' ? palette.danger : tone === 'accent' ? palette.accent : palette.neutral[700];
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { borderColor: border }]}>
      <Text style={[styles.buttonLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: layout.screenX,
  },
  dialog: {
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 20,
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: typeScale.title.fontSize,
  },
  body: {
    fontFamily: fonts.regular,
    ...typeScale.body,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 10,
  },
  actionsStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
  },
  button: {
    minWidth: 96,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonLabel: {
    fontFamily: fonts.medium,
    fontSize: typeScale.body.fontSize,
  },
});
