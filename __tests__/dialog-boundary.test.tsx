import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { RunDialog } from '@/components/automations/run-dialog';
import { SetupDialog } from '@/components/automations/setup-dialog';
import { DialogBoundary } from '@/components/dialog-boundary';
import type { SetupField } from '@/components/setup-field';
import {
  ERROR_BODY,
  NEWER_CONTROL_NOTE,
  RUN_FORM_ERROR_TITLE,
  TRY_AGAIN_LABEL,
  errorTitleFor,
} from '@/lib/content/screen-states';
import type { AutomationRunInputField } from '@/lib/platform/automations';
import { TEST_WORKSPACE, signedInSession } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'intent-key'),
  putFileToSignedUrl: jest.fn(),
}));
// The run form's file field reads the document picker and the file system; nothing here picks a file.
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: {} } }));

/**
 * Two children the dialogs draw, made to throw on a flag: how each dialog is
 * proved to be INSIDE its boundary, with nothing in the dialog's own code made
 * to fail. Read at render, never at module load.
 */
const mockThrow = { section: false, file: false };
jest.mock('@/components/nocturne/section-label', () => {
  const actual = jest.requireActual('@/components/nocturne/section-label');
  const ReactActual = jest.requireActual('react');
  return {
    ...actual,
    SectionLabel: (props: Record<string, unknown>) => {
      if (mockThrow.section) throw new Error('a section label this build cannot draw');
      return ReactActual.createElement(actual.SectionLabel, props);
    },
  };
});
jest.mock('@/components/automations/run-file-field', () => {
  const actual = jest.requireActual('@/components/automations/run-file-field');
  const ReactActual = jest.requireActual('react');
  return {
    ...actual,
    RunFileField: (props: Record<string, unknown>) => {
      if (mockThrow.file) throw new Error('a file field this build cannot draw');
      return ReactActual.createElement(actual.RunFileField, props);
    },
  };
});

const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * BUILD-PLAN 25.8.1 (Round 17, the owner's requirement 1 of 2026-10-08: no app
 * change per automation). The boundary around the Setup and Run dialogs: a
 * child that cannot be drawn ends in the failed-load words with Try again,
 * never a white screen — and a control newer than this build, the one failure
 * a new manifest could cause, is no failure at all inside either dialog: the
 * website's text input, the note, and the typed string sent as declared.
 */

/** React reports a caught render error through console.error; the throw is expected, so it is held quiet and counted. */
let consoleError: jest.SpyInstance;
beforeEach(() => {
  mockThrow.section = false;
  mockThrow.file = false;
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  consoleError.mockRestore();
});

/** A child that throws while `broken`, and draws its words once it is not. */
let broken = true;
function Fragile() {
  if (broken) throw new Error('cannot be drawn');
  return <Text>Drawn after all</Text>;
}

describe('DialogBoundary (25.8.1)', () => {
  it('catches a child that throws and draws the failed dialog in its place: the title, the kept session, Cancel and Try again', async () => {
    broken = true;
    const onClose = jest.fn();
    await renderWithProviders(
      <DialogBoundary title="Couldn't load this setup" onClose={onClose}>
        <Fragile />
      </DialogBoundary>,
    );
    const failed = await screen.findByTestId('dialog-failed');
    expect(within(failed).getByText("Couldn't load this setup")).toBeTruthy();
    expect(within(failed).getByText(ERROR_BODY)).toBeTruthy();
    expect(within(failed).getByText(TRY_AGAIN_LABEL)).toBeTruthy();
    expect(screen.queryByText('Drawn after all')).toBeNull();
    // The throw happened, and was caught: React reported it, nothing crashed.
    expect(consoleError).toHaveBeenCalled();
    await fireEvent.press(within(failed).getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Try again draws the children again, and a child that no longer throws is shown', async () => {
    broken = true;
    await renderWithProviders(
      <DialogBoundary title="Couldn't load this setup" onClose={jest.fn()}>
        <Fragile />
      </DialogBoundary>,
    );
    await screen.findByTestId('dialog-failed');
    broken = false;
    await fireEvent.press(screen.getByText(TRY_AGAIN_LABEL));
    expect(await screen.findByText('Drawn after all')).toBeTruthy();
    expect(screen.queryByTestId('dialog-failed')).toBeNull();
  });

  it('Try again on a child that still throws draws the failed dialog again — never a white screen', async () => {
    broken = true;
    await renderWithProviders(
      <DialogBoundary title="Couldn't load this setup" onClose={jest.fn()}>
        <Fragile />
      </DialogBoundary>,
    );
    await screen.findByTestId('dialog-failed');
    await fireEvent.press(screen.getByText(TRY_AGAIN_LABEL));
    expect(await screen.findByTestId('dialog-failed')).toBeTruthy();
    expect(screen.getByText(ERROR_BODY)).toBeTruthy();
  });

  it('draws its children untouched while nothing throws', async () => {
    broken = false;
    await renderWithProviders(
      <DialogBoundary title="Couldn't load this setup" onClose={jest.fn()}>
        <Fragile />
      </DialogBoundary>,
    );
    expect(screen.getByText('Drawn after all')).toBeTruthy();
    expect(screen.queryByTestId('dialog-failed')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

/* ───────────────────────── the two dialogs, inside it ───────────────────────── */

/** Every request a dialog sent: its method, path, key and body — the way automation-actions reads them. */
let sent: { method: string; path: string; key?: string; body?: unknown }[];
/** Answers by `METHOD path`, in order. */
let answers: Record<string, unknown[]>;

beforeEach(() => {
  sent = [];
  answers = {};
  const call = (method: string) => async (path: string, init: { params?: { header?: Record<string, string> }; body?: unknown }) => {
    sent.push({ method, path, key: init.params?.header?.['Idempotency-Key'], body: init.body });
    return { data: answers[`${method} ${path}`]?.shift() ?? {} };
  };
  const clients = { automations: { GET: call('GET'), POST: call('POST'), PATCH: call('PATCH') } };
  platformOperation.mockImplementation(async (_key: string, execute: Function) => (await execute(clients)).data);
});

const RUNS_PATH = '/v1/workspaces/{workspaceId}/runs';
const SUB_PATH = '/v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}';

/** A control this build does not know, as a newer platform would publish it: the generated union is closed, so the test says so. */
const NEWER = 'date-range' as never;
const WINDOW: AutomationRunInputField = { key: 'window', title: 'Review window', description: 'Which days to read', control: NEWER, required: true };
const NOTE: AutomationRunInputField = { key: 'note', title: 'Note', description: 'What to do', control: 'text', required: false };
const RECEIPT: AutomationRunInputField = { key: 'receipt', title: 'Receipt', description: 'The file to read', control: 'artifact', required: false };
const WINDOW_SETTING: SetupField = { section: 'source', key: 'window', title: 'Review window', description: 'Which days to read', control: NEWER, required: true };
const INBOX: SetupField = { section: 'source', key: 'inbox', title: 'Watch inbox', description: 'Which label to watch', control: 'resource-picker', required: true };

describe('the Run dialog (25.8.1)', () => {
  it('draws a control newer than this build as the website does — a text input with the note — and sends the typed string as declared', async () => {
    answers[`POST ${RUNS_PATH}`] = [{ run: { id: 'run-1' } }];
    const onStarted = jest.fn();
    await renderWithProviders(
      <RunDialog
        name="Invoice triage"
        subscriptionId="sub-1"
        shownWorkspaceId={TEST_WORKSPACE}
        runInput={[WINDOW, NOTE]}
        onClose={jest.fn()}
        onStarted={onStarted}
      />,
      signedInSession,
    );
    const dialog = screen.getByTestId('run-dialog');
    expect(within(dialog).getByText('Review window')).toBeTruthy();
    expect(within(dialog).getByText(NEWER_CONTROL_NOTE)).toBeTruthy();
    // One note: the text field beside it is a control this build knows.
    expect(within(dialog).getAllByText(NEWER_CONTROL_NOTE)).toHaveLength(1);
    await fireEvent.changeText(within(dialog).getByLabelText('Review window'), 'last week');
    await fireEvent.press(within(dialog).getByText('Start run'));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('run-1'));
    expect(sent).toEqual([
      { method: 'POST', path: RUNS_PATH, key: 'intent-key', body: { subscriptionId: 'sub-1', input: { window: 'last week' } } },
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("is inside its boundary: a row it cannot draw becomes the failed dialog in the run form's words, and Cancel is the dialog's own close", async () => {
    mockThrow.file = true;
    const onClose = jest.fn();
    await renderWithProviders(
      <RunDialog
        name="Invoice triage"
        subscriptionId="sub-1"
        shownWorkspaceId={TEST_WORKSPACE}
        runInput={[RECEIPT]}
        onClose={onClose}
        onStarted={jest.fn()}
      />,
      signedInSession,
    );
    const failed = await screen.findByTestId('dialog-failed');
    expect(within(failed).getByText(RUN_FORM_ERROR_TITLE)).toBeTruthy();
    expect(within(failed).getByText(ERROR_BODY)).toBeTruthy();
    expect(screen.queryByTestId('run-dialog')).toBeNull();
    expect(sent).toEqual([]);
    await fireEvent.press(within(failed).getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the Setup dialog (25.8.1)', () => {
  it('draws a control newer than this build under its section as the website does, beside the resource-picker it knows, and saves the typed string as declared', async () => {
    answers[`PATCH ${SUB_PATH}`] = [{ subscription: { id: 'sub-1' } }];
    const onSaved = jest.fn();
    await renderWithProviders(
      <SetupDialog
        subscriptionId="sub-1"
        shownWorkspaceId={TEST_WORKSPACE}
        setup={[WINDOW_SETTING, INBOX]}
        config={{ inbox: 'AP-Invoices' }}
        onClose={jest.fn()}
        onSaved={onSaved}
      />,
      signedInSession,
    );
    const dialog = screen.getByTestId('setup-dialog');
    expect(within(dialog).getByText('1 · SOURCE')).toBeTruthy();
    expect(within(dialog).getAllByText(NEWER_CONTROL_NOTE)).toHaveLength(1);
    // The picker is a control this build knows: its text input holds the configured name, and carries no note.
    expect(within(dialog).getByLabelText('Watch inbox').props.value).toBe('AP-Invoices');
    await fireEvent.changeText(within(dialog).getByLabelText('Review window'), 'last week');
    await fireEvent.press(within(dialog).getByText('Save setup'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(sent).toEqual([
      { method: 'PATCH', path: SUB_PATH, key: 'intent-key', body: { config: { window: 'last week', inbox: 'AP-Invoices' } } },
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('is inside its boundary: a row it cannot draw becomes "Couldn\'t load this setup", and Try again draws the dialog again once it can', async () => {
    mockThrow.section = true;
    await renderWithProviders(
      <SetupDialog
        subscriptionId="sub-1"
        shownWorkspaceId={TEST_WORKSPACE}
        setup={[INBOX]}
        config={{}}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
      signedInSession,
    );
    const failed = await screen.findByTestId('dialog-failed');
    expect(within(failed).getByText(errorTitleFor('setup'))).toBeTruthy();
    expect(within(failed).getByText("Couldn't load this setup")).toBeTruthy();
    expect(screen.queryByTestId('setup-dialog')).toBeNull();
    mockThrow.section = false;
    await fireEvent.press(within(failed).getByText(TRY_AGAIN_LABEL));
    expect(await screen.findByTestId('setup-dialog')).toBeTruthy();
    expect(screen.getByText('1 · SOURCE')).toBeTruthy();
    expect(screen.queryByTestId('dialog-failed')).toBeNull();
    expect(sent).toEqual([]);
  });
});
