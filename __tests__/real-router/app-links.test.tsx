import { act } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { flowCatalogPayload } from '@/test/platform';
import { SESSION, WORKSPACE, answerPlatform, flush, launch, signedInOnThisPhone } from '@/test/real-router';

/**
 * An email's or a push's link opens the app (round 23, A5 — the owner's build
 * 22 item 8): the router sends `/runs/<id>` and `/approvals/<id>` to Home
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

/** The link listener the signed-in tree set up. */
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
