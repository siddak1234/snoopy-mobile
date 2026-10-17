import { fireEvent, screen } from 'expo-router/testing-library';

import { WORKSPACE, answerPlatform, asInProduction, flush, launch, press, signedInOnThisPhone } from '@/test/real-router';

/**
 * Home's ways out (Gate 24 parity, G5; Build 21's RUN A FLOW, spec A9), under
 * the REAL router: each crosses from the Home tab into another tab's stack, so
 * each is proved where its address resolves — a live flow's page with the flow
 * it takes on arrival, Connections and Teams — and Back comes home. ~~A team's
 * page from Home's TEAMS list~~: gone with the owner's AM5 ("remove lsit teams
 * on bottom of home page, it is useless").
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

describe("Home's ways out (Gate 24 parity, G5; Build 21, A9)", () => {
  it("RUN A FLOW opens a live flow's page in the Flows tab, with the flow it takes on arrival (Build 21, spec A9)", async () => {
    signedInOnThisPhone();
    oneTeam();
    const view = await launch();

    await asInProduction(async () => {
      await fireEvent.press(await screen.findByTestId('home-quick-run-invoice'));
      await flush(100);
      await flush(1000);
    });
    expect([view.getSegments(), view.getSearchParams()]).toEqual([['(tabs)', 'flows', 'detail'], { flow: 'invoice' }]);
    expect(await screen.findByTestId('flow-steps')).toBeTruthy();
  });

  it.each([
    ['Connect integration', ['(tabs)', 'settings', 'connections']],
    ['View teams', ['(tabs)', 'settings', 'teams']],
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
