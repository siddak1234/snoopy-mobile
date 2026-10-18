import { fireEvent, screen, within } from 'expo-router/testing-library';

import { WORKSPACE, answerPlatform, asInProduction, flush, launch, signedInOnThisPhone } from '@/test/real-router';

/**
 * Home's ways out, under the REAL router: each crosses from the Home tab into
 * the Flows tab's stack, so each is proved where its address resolves — Add a
 * flow and Flows, Home's two pills (Build 22: "Then add a flow and flow
 * buttons", the owner's build 21 item 1). ~~RUN A FLOW's live flow page (Build
 * 21, spec A9), Connect integration and View teams (Gate 24 parity, G5)~~ until
 * Build 22 ("I dont want want flows integrations, connect integrations, view
 * teams, or run a flow"); ~~a team's page from Home's TEAMS list~~ until the
 * owner's AM5.
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

describe("Home's ways out (Build 22, H1–H4)", () => {
  it.each([
    ['Add a flow', ['(tabs)', 'flows', 'add']],
    ['Flows', ['(tabs)', 'flows']],
  ])('%s opens the Flows tab where it goes', async (label, segments) => {
    signedInOnThisPhone();
    oneTeam();
    const view = await launch();

    await asInProduction(async () => {
      // The pill, not the tab bar's own "Flows".
      await fireEvent.press(within(await screen.findByTestId('home-quick-actions')).getByText(label));
      await flush(100);
      await flush(1000);
    });
    expect(view.getSegments()).toEqual(segments);
  });
});
