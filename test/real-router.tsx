import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { router } from 'expo-router';

import { PlatformError } from '@/lib/platform/problem';
import type { Answer } from '@/test/fake-platform';
import { routePlatform, type RouteOverrides } from '@/test/platform';

/**
 * The real-router project's harness (its fakes are `test/real-router-setup.ts`).
 *
 * Learned reproducing the owner's build 12 item 6, and kept as rules here:
 * - RTL v14's render and `fireEvent.press` are async, and `renderRouter`
 *   returns the render's promise with its helpers attached: await both. An
 *   act scope left running overlaps the next ("You seem to have overlapping
 *   act() calls") and leaves state updates unrendered — false failures.
 * - `renderRouter` fakes the timers after React's scheduler took the real
 *   `setImmediate`, so `flush` yields to the real one as well.
 * - expo-router throws on a command no navigator handles only under
 *   NODE_ENV=test (build/ExpoRoot.js:196). A release build drops it without a
 *   word (:203) and development logs it, so `asInProduction` runs a press as
 *   development: what the phone does, plus a line of evidence.
 * - A redirect that loops would run until the heap is gone; `watchRouter` cuts
 *   `router.replace` off after `cut` calls, which is already the failure.
 */

export const WORKSPACE = '00000000-0000-4000-8000-000000000001';

/** The session the platform answers while the keychain holds a token. */
export const SESSION: Answer<'GET /v1/session'> = {
  authenticated: true,
  user: { userId: 'u1', email: 'alex@acme.co', activeWorkspaceId: WORKSPACE },
  workspaces: [{ id: WORKSPACE, name: 'Acme', type: 'organization', role: 'owner' }],
};

export const { platformOperation } = jest.requireMock('@/lib/platform/client') as { platformOperation: jest.Mock };
export const { kept } = jest.requireMock('expo-secure-store') as { kept: Map<string, string> };

/** A remembered session in the keychain, as a phone signed in earlier keeps it. */
export function signedInOnThisPhone(extra: Record<string, string> = {}) {
  kept.clear();
  kept.set('autom8x.access-token', 'access-1');
  kept.set('autom8x.refresh-token', 'refresh-1');
  kept.set('autom8x.access-expires-at', String(Date.now() + 3_600_000));
  for (const [key, value] of Object.entries(extra)) kept.set(key, value);
}

/**
 * The platform these tests talk to, recording each operation it is asked for.
 *
 * `GET /v1/session` answers the session while the keychain holds an access
 * token and 401 without one — what a cold start with an empty keychain is told;
 * `POST /v1/auth/logout` answers 204; every other read answers the fixtures
 * (`routePlatform`, with `fixtures` matched by path fragment, as it takes them).
 * `answers` replaces any of them by operation key.
 */
export function answerPlatform(
  answers: Record<string, (path: string) => unknown> = {},
  fixtures: RouteOverrides = {},
) {
  const calls: string[] = [];
  platformOperation.mockReset();
  routePlatform(platformOperation, fixtures);
  const routed = platformOperation.getMockImplementation()!;
  platformOperation.mockImplementation(async (path: string, execute: unknown) => {
    calls.push(path);
    const own = answers[path];
    if (own) return own(path);
    if (path === '/v1/session') {
      if (!kept.has('autom8x.access-token')) throw new PlatformError('Sign in is required.', 401, 'UNAUTHENTICATED');
      return SESSION;
    }
    if (path === '/v1/auth/logout') return null;
    return routed(path, execute);
  });
  return calls;
}

/**
 * Every `router.replace`, and every navigation command no navigator handled —
 * build 12's sign-out made both: a "/" the tab bar could not take, then a
 * redirect replacing the tabs with themselves, again and again.
 */
export function watchRouter(cut = 12) {
  const replaces: string[] = [];
  const unhandled: string[] = [];
  const replace = router.replace;
  jest.spyOn(router, 'replace').mockImplementation((href, options) => {
    replaces.push(String(href));
    if (replaces.length > cut) return undefined;
    return replace(href, options);
  });
  const error = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const text = String(args[0]);
    if (text.includes('was not handled by any navigator')) unhandled.push(text.split('\n')[0]!);
    else error(...args);
  });
  return { replaces, unhandled };
}

async function realYield() {
  await act(async () => {
    await new Promise<void>((resolve) =>
      (jest.requireActual('timers') as { setImmediate: (callback: () => void) => void }).setImmediate(resolve),
    );
  });
}

/** Let `ms` of the app's time pass, and everything it set off settle. */
export async function flush(ms = 0) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
  for (let i = 0; i < 5; i++) await realYield();
}

/** Press what reads `text`, and let what it starts finish. */
export async function press(text: string | RegExp) {
  const target = await screen.findByText(text);
  await fireEvent.press(target);
  await flush(100);
  await flush(1000);
}

/** Press a tab in the tab bar — by its role, since a screen can draw the same word. */
export async function pressTab(label: 'Home' | 'Flows' | 'Activity' | 'Settings') {
  const target = await screen.findByRole('tab', { name: label });
  await fireEvent.press(target);
  await flush(100);
  await flush(1000);
}

/**
 * Open the app at `initialUrl`; the splash leaves for the workspace 2400 ms after
 * it mounts. Answers where the app is: the address, and the route's groups.
 */
export async function launch(initialUrl = '/') {
  const view = renderRouter('./app', { initialUrl });
  // The helpers ride on the render's promise, which an async function would
  // unwrap on return: keep them before awaiting it.
  const where = { getPathname: () => view.getPathname(), getSegments: () => view.getSegments() };
  await (view as unknown as Promise<unknown>);
  await flush(0);
  await flush(2500);
  await flush(100);
  return where;
}

/** Run `step` as a release build would meet a command no navigator handles (see above). */
export async function asInProduction(step: () => Promise<void>) {
  // Expo types NODE_ENV as read-only; at run time it is an ordinary variable.
  const env = process.env as Record<string, string | undefined>;
  const before = env.NODE_ENV;
  env.NODE_ENV = 'development';
  try {
    await step();
  } finally {
    env.NODE_ENV = before;
  }
}
