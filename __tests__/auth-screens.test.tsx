import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { Linking, StyleSheet } from 'react-native';

import LoginScreen from '@/app/(auth)/login';
import { routePlatform, signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

// The website's origin, for the line under the buttons: the browser leg's base, as Account deleted uses it.
const mockExtra: { nativeAuthBaseUrl?: string } = {};
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

jest.mock('@/lib/platform/session-store', () => ({ readSession: jest.fn(), readFaceIdChoice: jest.fn() }));
const { readSession, readFaceIdChoice } = jest.requireMock('@/lib/platform/session-store');
const LocalAuthentication = jest.requireMock('expo-local-authentication');

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

beforeEach(() => {
  readSession.mockReset();
  readSession.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 60_000 });
  readFaceIdChoice.mockReset().mockResolvedValue('unset');
  LocalAuthentication.hasHardwareAsync.mockReset().mockResolvedValue(true);
  LocalAuthentication.isEnrolledAsync.mockReset().mockResolvedValue(true);
  platformOperation.mockReset();
  routePlatform(platformOperation);
  mockExtra.nativeAuthBaseUrl = 'https://www.example.test/api/platform';
});

describe('Log in', () => {
  it('is one screen with the website\'s words: Sign in, the providers, and Remember me (feedback #1)', async () => {
    const { getByText, findByText, queryByText } = await renderWithProviders(<LoginScreen />);
    expect(getByText('Sign in')).toBeTruthy();
    // The subtitle went with the cover page, which already says what this is (24.11.6).
    expect(queryByText('Continue to Autom8x.')).toBeNull();
    expect(await findByText('Sign in with Apple')).toBeTruthy();
    expect(getByText('Sign in with Google')).toBeTruthy();
    expect(getByText('Sign in with Microsoft')).toBeTruthy();
    expect(getByText('Remember me')).toBeTruthy();
    expect(screen.getByRole('switch').props.accessibilityState?.checked ?? true).toBe(true);
    // No second name for the same action, and no divider above an empty column.
    expect(queryByText('Sign up')).toBeNull();
    expect(queryByText(/New here/)).toBeNull();
    expect(queryByText('Log in')).toBeNull();
  });

  it('asks the Face ID question once, after a remembered sign-in on a device that has it (feedback, 2026-10-02)', async () => {
    const signIn = jest.fn(async () => ({ status: 'signed-in' as const }));
    const { findByText } = await renderWithProviders(<LoginScreen />, { ...signedInSession, signIn });
    await fireEvent.press(await findByText('Sign in with Google'));
    expect(signIn).toHaveBeenCalledWith('google', { remember: true });
    await screen.findByText('Sign in');
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/faceid-offer');
    expect(mockRouter.replace.mock.calls.map((call: unknown[]) => call[0])).not.toContain('/(tabs)/(home)');
  });

  it('goes straight in when the question was already answered, or when there is no biometrics', async () => {
    readFaceIdChoice.mockResolvedValue('off');
    const signIn = jest.fn(async () => ({ status: 'signed-in' as const }));
    const { findByText } = await renderWithProviders(<LoginScreen />, { ...signedInSession, signIn });
    await fireEvent.press(await findByText('Sign in with Google'));
    await screen.findByText('Sign in');
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/(home)', { withAnchor: true });
    expect(mockRouter.replace).not.toHaveBeenCalledWith('/(auth)/faceid-offer');
  });

  it('with Remember me off, signs in for this run only and never asks about Face ID', async () => {
    const signIn = jest.fn(async () => ({ status: 'signed-in' as const }));
    const { findByText } = await renderWithProviders(<LoginScreen />, { ...signedInSession, signIn });
    await findByText('Sign in with Google');
    await fireEvent(screen.getByRole('switch'), 'press');
    await fireEvent.press(screen.getByText('Sign in with Google'));
    expect(signIn).toHaveBeenCalledWith('google', { remember: false });
    await screen.findByText('Sign in');
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/(home)', { withAnchor: true });
  });

  it('offers no Face ID unlock when this device holds no session (feedback #10, #12)', async () => {
    // Biometrics unlock a stored session and never mint one: after a sign-out or
    // a fresh install there is nothing to unlock, so the button would only lead
    // to "Sign in with your identity provider first."
    readSession.mockResolvedValue(null);
    const { queryByText, findByText } = await renderWithProviders(<LoginScreen />);
    expect(await findByText('Sign in with Google')).toBeTruthy();
    expect(queryByText('Unlock with Face ID')).toBeNull();
  });

  it('offers no password path at all, and routes the one real navigation action', async () => {
    // Owner direction 2026-09-08 (platform §12.1 #90): the Edge refuses password
    // login and the website shows providers only, so the app draws no email,
    // password, remember-me, "forgot" or Log In control — a form that only ever
    // refused taught people the product had a capability it does not.
    const { getByText, queryByText, queryByLabelText } = await renderWithProviders(<LoginScreen />);
    expect(queryByLabelText('Email')).toBeNull();
    expect(queryByLabelText('Password')).toBeNull();
    expect(queryByText('Stay logged in')).toBeNull();
    expect(queryByText('Forgot?')).toBeNull();
    expect(queryByText('Log In')).toBeNull();
    expect(mockRouter.replace.mock.calls.map((call: unknown[]) => call[0])).not.toContain('/(tabs)/(home)');
    // The unlock is offered because this device holds a session to unlock.
    await fireEvent.press(await screen.findByText('Unlock with Face ID'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/faceid');
  });
});

/** Every string drawn, in reading order. */
function drawnText(tree: unknown): string[] {
  const words: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') words.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') ((node as { children?: unknown[] | null }).children ?? []).forEach(walk);
  };
  walk(tree);
  return words;
}

describe("the line under the sign-in buttons (the owner's decision of 2026-10-13)", () => {
  const LINE = 'By continuing, you agree to our Terms of Service and Privacy Policy.';
  let openURL: jest.SpyInstance;
  beforeEach(() => {
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });
  afterEach(() => openURL.mockRestore());

  it("says the website's words under the buttons and above Remember me, as Remember me's own line is drawn — nothing to tick, and a provider still signs in at one press", async () => {
    const signIn = jest.fn(async () => ({ status: 'cancelled' as const }));
    const view = await renderWithProviders(<LoginScreen />, { ...signedInSession, signIn });
    await screen.findByText('Sign in with Microsoft');
    const line = screen.getByText(LINE);
    // In reading order: every provider's button, then the line, then Remember me.
    const words = drawnText(view.toJSON());
    const at = (start: string) => {
      const index = words.findIndex((text) => text.startsWith(start));
      expect(index).toBeGreaterThanOrEqual(0);
      return index;
    };
    for (const provider of ['Apple', 'Google', 'Microsoft']) {
      expect(at(`Sign in with ${provider}`)).toBeLessThan(at('By continuing, you agree to our'));
    }
    expect(at('By continuing, you agree to our')).toBeLessThan(at('Remember me'));
    // Normal readable text: never smaller or fainter than this screen's secondary line.
    const drawn = StyleSheet.flatten(line.props.style);
    const secondary = StyleSheet.flatten(screen.getByText('Stay signed in on this phone.').props.style);
    expect(drawn.fontSize).toBe(secondary.fontSize);
    expect(drawn.color).toBe(secondary.color);
    // Links that look like links, and say they are.
    for (const id of ['login-terms', 'login-privacy']) {
      const link = screen.getByTestId(id);
      expect(link.props.accessibilityRole).toBe('link');
      expect(StyleSheet.flatten(link.props.style).textDecorationLine).toBe('underline');
    }
    expect(screen.getByTestId('login-terms')).toHaveTextContent('Terms of Service');
    expect(screen.getByTestId('login-privacy')).toHaveTextContent('Privacy Policy');
    // Nothing to tick: Remember me stays the screen's one switch, and signing in is still one press.
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    await fireEvent.press(screen.getByText('Sign in with Google'));
    expect(signIn).toHaveBeenCalledWith('google', { remember: true });
    expect(openURL).not.toHaveBeenCalled();
  });

  it("opens the website's Terms of Service and Privacy Policy", async () => {
    await renderWithProviders(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-terms'));
    await fireEvent.press(screen.getByTestId('login-privacy'));
    expect(openURL).toHaveBeenCalledTimes(2);
    expect(openURL).toHaveBeenNthCalledWith(1, 'https://www.example.test/terms');
    expect(openURL).toHaveBeenNthCalledWith(2, 'https://www.example.test/privacy');
  });

  it('says the same words, plain, where the app does not know the website', async () => {
    delete mockExtra.nativeAuthBaseUrl;
    await renderWithProviders(<LoginScreen />);
    expect(screen.getByText(LINE)).toBeTruthy();
    expect(screen.queryByTestId('login-terms')).toBeNull();
    expect(screen.queryByTestId('login-privacy')).toBeNull();
  });
});
