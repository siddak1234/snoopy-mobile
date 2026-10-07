import { fireEvent, screen } from 'expo-router/testing-library';

import { WORKSPACE, answerPlatform, asInProduction, flush, launch, press, signedInOnThisPhone } from '@/test/real-router';

/**
 * Home's new ways out (Gate 24 parity, G5 and G7), under the REAL router: each
 * crosses from the Home tab into the Settings tab's stack, so each is proved
 * where its address resolves — a team's page with the team and workspace it
 * takes on arrival, Connections and Teams — and Back comes home.
 */

jest.setTimeout(60_000);

afterEach(() => {
  jest.restoreAllMocks();
});

/** The platform, with one workspace holding one team. */
function oneTeam() {
  answerPlatform(
    {
      '/v1/workspaces': () => ({
        workspaces: [{ id: WORKSPACE, name: 'Acme', type: 'organization', role: 'owner' }],
        activeWorkspaceId: WORKSPACE,
      }),
    },
    {
      '/projects': {
        projects: [
          {
            id: 'team-finance',
            workspaceId: WORKSPACE,
            name: 'Finance',
            type: 'Finance',
            status: 'active',
            viewerRole: 'owner',
            createdAt: '2026-09-01T00:00:00Z',
          },
        ],
      },
    },
  );
}

describe("Home's ways into Settings (Gate 24 parity, G5, G7)", () => {
  it('a team opens its page in the Settings tab, with the team and the workspace it takes on arrival', async () => {
    signedInOnThisPhone();
    oneTeam();
    const view = await launch();

    await asInProduction(async () => {
      await fireEvent.press(await screen.findByTestId('home-team-team-finance'));
      await flush(100);
      await flush(1000);
    });
    expect([view.getSegments(), view.getSearchParams()]).toEqual([
      ['(tabs)', 'settings', 'team'],
      { projectId: 'team-finance', workspaceId: WORKSPACE },
    ]);
  });

  it.each([
    ['Connect integration', ['(tabs)', 'settings', 'connections']],
    ['View teams', ['(tabs)', 'settings', 'teams']],
    ['View all teams', ['(tabs)', 'settings', 'teams']],
  ])('%s opens its Settings page, and Back comes home', async (label, segments) => {
    signedInOnThisPhone();
    oneTeam();
    const view = await launch();

    await asInProduction(async () => {
      await press(label);
    });
    expect(view.getSegments()).toEqual(segments);

    await asInProduction(async () => {
      await fireEvent.press(screen.getAllByLabelText('Back')[0]!);
      await flush(100);
      await flush(1000);
    });
    expect([view.getPathname(), view.getSegments()]).toEqual(['/', ['(tabs)', '(home)']]);
  });
});
