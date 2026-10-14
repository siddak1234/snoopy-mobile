import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';

import HomeScreen from '@/app/(tabs)/(home)/index';
import SettingsScreen from '@/app/(tabs)/settings';
import { forgetSavedAiReading } from '@/hooks/use-ai-reading';
import type { SessionContextValue } from '@/hooks/use-session';
import { PlatformError } from '@/lib/platform/problem';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { resetPushForTests } from '@/hooks/use-push-registration';
import { routePlatform, sessionAs } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key'),
}));
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
