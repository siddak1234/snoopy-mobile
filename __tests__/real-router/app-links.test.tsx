import { getActionFromState } from '@react-navigation/native';
import { store } from 'expo-router/build/global-state/router-store';
import { extractExpoPathFromURL } from 'expo-router/build/fork/extractPathFromURL';
import { act } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { redirectSystemPath } from '@/app/+native-intent';
import { flowCatalogPayload } from '@/test/platform';
import {
  SESSION,
  WORKSPACE,
  answerPlatform,
  asInProduction,
  flush,
  kept,
  launch,
  press,
  signedInOnThisPhone,
} from '@/test/real-router';

/**
 * An email's or a push's link opens the app (round 23, A5 — the owner's build
 * 22 item 8): the router starts at the splash on `/runs/<id>` and
 * `/approvals/<id>`, or stays where it is when the app is already open
 * (`app/+native-intent.tsx`), and the signed-in tree opens the run's page or
 * Approvals in the workspace the link names, switching to it first. The unit
 * tests hold the hrefs; only the real router shows where they land.
 */

jest.setTimeout(60_000);

const OTHER = '5d0f3a8e-2c41-4b7a-9e15-0a6c3f2b7d94';
const nativeAuth = jest.requireMock('@/lib/platform/native-auth') as { nativeRedirectUri: () => string | null };

beforeEach(() => {
  // The app's link host: the login callback's, as the release pins it.
  nativeAuth.nativeRedirectUri = () => 'https://app.autom8x.ai/auth/native/callback';
});

/** The link listener the root layout set up (`useLinkHolder`), which hands the link to the signed-in tree. */
function heard(url: string) {
  const calls = (Linking.addEventListener as jest.Mock).mock.calls.filter(([type]) => type === 'url');
  return (calls.at(-1)![1] as (event: { url: string }) => void)({ url });
}

/** A session with the person's second workspace, whose active one follows the platform's switch. */
function twoWorkspaces() {
  let active = WORKSPACE;
  const switched: string[] = [];
  const calls = answerPlatform(
    {
      '/v1/session': () => ({
        ...SESSION,
        user: { ...SESSION.user, activeWorkspaceId: active },
        workspaces: [...SESSION.workspaces, { id: OTHER, name: 'Northwind', type: 'organization', role: 'owner' }],
      }),
      '/v1/session/active-workspace': () => {
        switched.push(OTHER);
        active = OTHER;
        return { activeWorkspaceId: OTHER };
      },
    },
    { '/automations': flowCatalogPayload() },
  );
  return { calls, switched, active: () => active };
}

it("a run link in another of the person's workspaces switches to it, then opens the run's page there", async () => {
  signedInOnThisPhone();
  const platform = twoWorkspaces();
  const view = await launch();
  expect(view.getPathname()).toBe('/');

  await act(async () => heard(`https://app.autom8x.ai/runs/run-0?workspace=${OTHER}`));
  await flush(100);
  await flush(1000);
  expect(platform.switched).toEqual([OTHER]);
  expect(platform.active()).toBe(OTHER);
  expect(view.getPathname()).toBe('/run');
  expect(view.getSearchParams()).toMatchObject({ runId: 'run-0' });
  // The switch, then the session read again, before the run's page read anything.
  const switchedAt = platform.calls.indexOf('/v1/session/active-workspace');
  expect(switchedAt).toBeGreaterThan(-1);
  expect(platform.calls.slice(switchedAt + 1)).toContain('/v1/session');
});

it('an approval link opens Approvals', async () => {
  signedInOnThisPhone();
  answerPlatform({}, { '/automations': flowCatalogPayload() });
  const view = await launch();

  await act(async () => heard(`https://app.autom8x.ai/approvals/apr-0?workspace=${WORKSPACE}`));
  await flush(100);
  await flush(1000);
  expect(view.getPathname()).toBe('/activity/approvals');
});

/**
 * What the router itself does with a link that arrives while the app is open,
 * after `redirectSystemPath` with `initial: false`: an empty path is dropped
 * (`node_modules/expo-router/build/link/linking.js`); any other becomes a state
 * whose action is dispatched on the root, as `useLinking.native`'s listener
 * does (`node_modules/expo-router/build/fork/useLinking.native.js`). Under Jest
 * the router subscribes no `url` listener of its own (the app's is the only
 * one), so the test plays it.
 */
async function routerHears(url: string) {
  const href = await redirectSystemPath({ path: url, initial: false });
  if (!href) return;
  const navigation = store.navigationRef.current!;
  const linking = store.linking!;
  const state = linking.getStateFromPath!(extractExpoPathFromURL([], href), linking.config);
  if (!state) return;
  const action = (linking.getActionFromState ?? getActionFromState)(state, linking.config);
  if (action) navigation.dispatch(action);
  else navigation.resetRoot(state);
}

it('a run link that arrives while the app is open opens the run from the tabs, never passing the cover', async () => {
  signedInOnThisPhone();
  answerPlatform({}, { '/automations': flowCatalogPayload() });
  const view = await launch();
  expect(view.getSegments()).toEqual(['(tabs)', '(home)']);

  const url = `https://app.autom8x.ai/runs/run-0?workspace=${WORKSPACE}`;
  // The phone hands the link to every `url` listener in the order they
  // subscribed: the app's (a child's effect runs first), then the router's.
  await act(async () => {
    await heard(url);
    await routerHears(url);
  });
  const seen: string[][] = [];
  for (const ms of [0, 50, 100, 500, 1000, 2500]) {
    await flush(ms);
    seen.push(view.getSegments());
  }
  // The cover (`app/index.tsx`) is the root's empty segment list.
  expect(seen.filter((segments) => segments.length === 0)).toEqual([]);
  expect(view.getPathname()).toBe('/run');
  expect(view.getSearchParams()).toMatchObject({ runId: 'run-0' });
});

it('a link that arrives on Sign in leaves Sign in where it is, never sending it to the cover, and opens the run once signed in', async () => {
  kept.clear();
  answerPlatform({}, { '/automations': flowCatalogPayload() });
  // Signed out, the cover; Get started replaces it with Sign in, as on a phone.
  const view = await launch();
  await press('Get started');
  const before = view.getSegments();
  expect(before).toEqual(['(auth)', 'login']);

  const url = `https://app.autom8x.ai/runs/run-0?workspace=${WORKSPACE}`;
  await act(async () => {
    await heard(url);
    await routerHears(url);
  });
  await flush(100);
  await flush(2500);
  expect(view.getSegments()).toEqual(before);

  // Held, not lost (round 23's review): the sign-in opens the session, and the run with it.
  await asInProduction(async () => {
    await press('Sign in with Google');
  });
  await flush(1000);
  expect(view.getPathname()).toBe('/run');
  expect(view.getSearchParams()).toMatchObject({ runId: 'run-0' });
});
