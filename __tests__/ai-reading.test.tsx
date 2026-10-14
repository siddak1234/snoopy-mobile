import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React, { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import HomeScreen from '@/app/(tabs)/(home)/index';
import SettingsScreen from '@/app/(tabs)/settings';
import { StartRun } from '@/components/automations/start-run';
import { forgetSavedAiReading } from '@/hooks/use-ai-reading';
import { SessionContext, type SessionContextValue } from '@/hooks/use-session';
import { PlatformError } from '@/lib/platform/problem';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { resetPushForTests } from '@/hooks/use-push-registration';
import { TEST_WORKSPACE, routePlatform, sessionAs } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key'),
}));
// Start run's file field reads the document picker and the file system; nothing here picks a file.
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: {} } }));
// The website's origin, for the card's Privacy Policy: the browser leg's base.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { nativeAuthBaseUrl: 'https://www.example.test/api/platform' } } },
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * "AI reads your documents" on the account (backend ADR-0038; spec §3.G, §3.H;
 * the owner's build 19 item 4: "Shouldnt this happen at the time of signing up
 * for the account"): the card once on Home while the account has never
 * answered — a new sign-in and an existing account alike — and the switch in
 * Settings › SECURITY, below Face ID. Both save with
 * `PUT /v1/session/ai-document-reading`.
 */

const CONSENT = '/v1/session/ai-document-reading';

/** The account, signed in, its answer `choice` (null: never asked). */
function answeredAs(choice: 'allowed' | 'declined' | null, reload = jest.fn(async () => ({ status: 'signed-in' as const }))): SessionContextValue {
  const owner = sessionAs('owner');
  if (owner.status !== 'signed-in') throw new Error('fixture');
  return { ...owner, reload, session: { ...owner.session, user: { ...owner.session.user, aiDocumentReading: choice } } };
}

/** Every answer saved, by its body; `refuse` makes the next one fail. */
function keepChoices(refuse = false): unknown[] {
  routePlatform(platformOperation);
  const routed = platformOperation.getMockImplementation()!;
  const bodies: unknown[] = [];
  let refusing = refuse;
  platformOperation.mockImplementation(async (path: string, execute: Function) => {
    if (path !== CONSENT) return routed(path, execute);
    let body: { choice: string } | undefined;
    const put = async (_route: string, init: { body: { choice: string } }) => {
      body = init.body;
      return { data: {} };
    };
    await execute({ platform: { PUT: put } });
    bodies.push(body);
    if (refusing) {
      refusing = false;
      throw new PlatformError('The account service did not answer.', 502);
    }
    return { aiDocumentReading: body!.choice, decidedAt: '2026-10-14T20:00:00Z' };
  });
  return bodies;
}

beforeEach(() => {
  platformOperation.mockReset();
  forgetSavedAiReading();
  resetSnapshot();
  resetPushForTests();
});

describe('the card on Home, once, while the account has never answered (spec §3.G)', () => {
  it('asks in its words — Allow and Not now, the Privacy Policy a link to the website — over Home', async () => {
    keepChoices();
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await renderWithProviders(<HomeScreen />, answeredAs(null));
    const card = await screen.findByTestId('ai-reading-card');
    expect(within(card).getByText('AI reads your documents')).toBeTruthy();
    expect(
      within(card).getByText("Some flows send a document you add to AI models, through OpenRouter, to read it. They don't keep it."),
    ).toBeTruthy();
    expect(within(card).getByText('See our Privacy Policy.')).toBeTruthy();
    expect(within(card).getByText('Allow')).toBeTruthy();
    expect(within(card).getByText('Not now')).toBeTruthy();
    await fireEvent.press(within(card).getByTestId('ai-reading-privacy'));
    expect(openURL).toHaveBeenCalledWith('https://www.example.test/privacy');
    openURL.mockRestore();
  });

  it.each([
    ['Allow', 'allowed'],
    ['Not now', 'declined'],
  ] as const)('%s saves "%s" on the account, reads the session again, and the card is gone', async (button, choice) => {
    const bodies = keepChoices();
    const reload = jest.fn(async () => ({ status: 'signed-in' as const }));
    await renderWithProviders(<HomeScreen />, answeredAs(null, reload));
    await fireEvent.press(within(await screen.findByTestId('ai-reading-card')).getByText(button));
    await waitFor(() => expect(screen.queryByTestId('ai-reading-card')).toBeNull());
    expect(bodies).toEqual([{ choice }]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('says a save that failed in its words, and stays until one lands', async () => {
    const bodies = keepChoices(true);
    await renderWithProviders(<HomeScreen />, answeredAs(null));
    const card = await screen.findByTestId('ai-reading-card');
    await fireEvent.press(within(card).getByText('Allow'));
    expect(await within(card).findByText('Could not save your choice. Try again.')).toBeTruthy();
    expect(screen.getByTestId('ai-reading-card')).toBeTruthy();
    await fireEvent.press(within(card).getByText('Allow'));
    await waitFor(() => expect(screen.queryByTestId('ai-reading-card')).toBeNull());
    expect(bodies).toEqual([{ choice: 'allowed' }, { choice: 'allowed' }]);
  });

  it("after a failed save, Not now closes the card and saves nothing — still unasked, Home asks again next time (iOS has no back gesture to close it)", async () => {
    const bodies = keepChoices(true);
    const home = await renderWithProviders(<HomeScreen />, answeredAs(null));
    const card = await screen.findByTestId('ai-reading-card');
    await fireEvent.press(within(card).getByText('Allow'));
    expect(await within(card).findByText('Could not save your choice. Try again.')).toBeTruthy();
    await fireEvent.press(within(card).getByText('Not now'));
    await waitFor(() => expect(screen.queryByTestId('ai-reading-card')).toBeNull());
    expect(bodies).toEqual([{ choice: 'allowed' }]);
    await home.unmount();
    await renderWithProviders(<HomeScreen />, answeredAs(null));
    expect(await screen.findByTestId('ai-reading-card')).toBeTruthy();
  });

  it('closed with the back gesture saves nothing, and waits for the next time Home opens', async () => {
    const bodies = keepChoices();
    await renderWithProviders(<HomeScreen />, answeredAs(null));
    await fireEvent(await screen.findByTestId('ai-reading-card'), 'requestClose');
    await waitFor(() => expect(screen.queryByTestId('ai-reading-card')).toBeNull());
    expect(bodies).toEqual([]);
  });

  it.each(['allowed', 'declined'] as const)('is never drawn for an account that answered %s', async (choice) => {
    keepChoices();
    await renderWithProviders(<HomeScreen />, answeredAs(choice));
    expect(await screen.findByTestId('home-header')).toBeTruthy();
    expect(screen.queryByTestId('ai-reading-card')).toBeNull();
  });
});

describe('the switch in Settings › SECURITY, below Face ID (spec §3.H)', () => {
  const toggle = () => within(screen.getByTestId('settings-ai-reading')).getByRole('switch');

  it('is "AI reads documents", on for an account that allowed it, with the sparkle at 24', async () => {
    keepChoices();
    await renderWithProviders(<SettingsScreen />, answeredAs('allowed'));
    const row = await screen.findByTestId('settings-ai-reading');
    expect(within(row).getByText('AI reads documents')).toBeTruthy();
    expect(within(row).getByTestId(/^phosphor-react-native-sparkle-/u).props.width).toBe(24);
    expect(toggle().props.accessibilityState).toMatchObject({ checked: true });
  });

  it.each([
    ['off, for an account that never answered', null, 'allowed'],
    ['off, for an account that said Not now', 'declined', 'allowed'],
    ['on', 'allowed', 'declined'],
  ] as const)('%s: a press saves the other answer, and the switch says it', async (_case, choice, saved) => {
    const bodies = keepChoices();
    await renderWithProviders(<SettingsScreen />, answeredAs(choice));
    await screen.findByTestId('settings-ai-reading');
    await fireEvent.press(toggle());
    await waitFor(() => expect(bodies).toEqual([{ choice: saved }]));
    await waitFor(() => expect(toggle().props.accessibilityState).toMatchObject({ checked: saved === 'allowed' }));
  });

  it('says a save that failed under the switch, and Try again repeats it', async () => {
    const bodies = keepChoices(true);
    await renderWithProviders(<SettingsScreen />, answeredAs('declined'));
    await screen.findByTestId('settings-ai-reading');
    await fireEvent.press(toggle());
    expect(await screen.findByText('Could not save. Try again.')).toBeTruthy();
    expect(toggle().props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(within(screen.getByTestId('action-failure')).getByText('Try again'));
    await waitFor(() => expect(toggle().props.accessibilityState).toMatchObject({ checked: true }));
    expect(bodies).toEqual([{ choice: 'allowed' }, { choice: 'allowed' }]);
    expect(screen.queryByText('Could not save. Try again.')).toBeNull();
  });
});

describe('what this app saved stands only until the session is read again (the review of the Invoice Processing screens)', () => {
  /** The latest read's reload: the next session read, as a return to the app makes one. */
  let readAgain: () => Promise<unknown> = async () => undefined;

  /** The session as `SessionProvider` holds it: each read a new answer, what the account says then. */
  function SessionReadAgain({ says, children }: { says: () => 'allowed' | 'declined' | null; children: React.ReactNode }) {
    const [value, setValue] = useState<SessionContextValue | null>(null);
    useEffect(() => {
      const read = async () => {
        setValue(answeredAs(says(), jest.fn(read)));
        return { status: 'signed-in' as const };
      };
      readAgain = read;
      void read();
    }, [says]);
    return value ? <SessionContext.Provider value={value}>{children}</SessionContext.Provider> : null;
  }

  it("Allow, then turned off on the website: the next read is the account's word — the switch off, and Start run says AI reading is off", async () => {
    const bodies = keepChoices() as { choice: 'allowed' | 'declined' }[];
    let website: 'declined' | undefined;
    // The account says what was saved last, until the website changes it.
    const says = () => website ?? bodies.at(-1)?.choice ?? null;
    await renderWithProviders(
      <SessionReadAgain says={says}>
        <SettingsScreen />
        <StartRun
          subscriptionId="sub-1"
          shownWorkspaceId={TEST_WORKSPACE}
          runInput={[{ key: 'invoiceFile', title: 'Document', description: 'A PDF or photo.', control: 'artifact', required: false }]}
          usesAi
          onStarted={() => {}}
        />
      </SessionReadAgain>,
      answeredAs(null),
    );
    const toggle = () => within(screen.getByTestId('settings-ai-reading')).getByRole('switch');
    await screen.findByTestId('settings-ai-reading');
    await fireEvent.press(toggle());
    await waitFor(() => expect(toggle().props.accessibilityState).toMatchObject({ checked: true }));
    expect(bodies).toEqual([{ choice: 'allowed' }]);
    expect(screen.queryByTestId('ai-reading-off')).toBeNull();

    // Turned off on the website; this phone reads the session again.
    website = 'declined';
    await act(() => readAgain());
    await waitFor(() => expect(toggle().props.accessibilityState).toMatchObject({ checked: false }));
    expect(within(screen.getByTestId('ai-reading-off')).getByText('AI reading is off.')).toBeTruthy();
    expect(bodies).toHaveLength(1);
  });
});
