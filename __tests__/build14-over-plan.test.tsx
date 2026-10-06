import { screen } from '@testing-library/react-native';
import React from 'react';

import FlowsScreen from '@/app/(tabs)/flows/index';
import { RUNS_UNCONFIGURED, overPlanSentence, runRefusal } from '@/lib/content/refusals';
import { PlatformError } from '@/lib/platform/problem';
import { flowsOverPlan } from '@/lib/view/billing';
import {
  TEST_WORKSPACE,
  flowCatalogPayload,
  projectsPayload,
  routePlatform,
  signedInSession,
  subscriptionsPayload,
} from '@/test/platform';
import { renderWithProviders } from '@/test/render';

/**
 * Over the plan's flow allowance — the owner's build 13 decision 7a3: a
 * workspace holding more flows than its plan allows starts no run on any flow
 * until it archives down. The platform refuses the start (403 `over_plan_limit`
 * with `limit` and `live`) and lists the allowance beside the flows
 * (`flowAllowance`); the app says both in the website's words.
 */

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

const mockStored = new Map<string, string | null>();
jest.mock('@/lib/platform/scope-store', () => ({
  readScope: jest.fn(async (workspaceId: string) => mockStored.get(workspaceId) ?? null),
  writeScope: jest.fn(async (workspaceId: string, projectId: string | null) => {
    mockStored.set(workspaceId, projectId);
  }),
}));

beforeEach(() => {
  platformOperation.mockReset();
  mockStored.clear();
});

const OVER = 'Your plan allows 2 flows; this workspace has 4. No flow can start a run until you archive 2. Paused and draft flows count.';

describe('the over-limit sentence (decision 7a3)', () => {
  it('says the allowance, the count and how many to archive, and that paused and draft flows count', () => {
    expect(overPlanSentence(2, 4)).toBe(OVER);
    expect(overPlanSentence(1, 2)).toBe(
      'Your plan allows 1 flow; this workspace has 2. No flow can start a run until you archive 1. Paused and draft flows count.',
    );
  });

  it('is over only when a ceiling is known and passed: within it, unlimited and unknown are not', () => {
    expect(flowsOverPlan({ allowed: 2, live: 4 })).toEqual({ allowed: 2, live: 4 });
    expect(flowsOverPlan({ allowed: 2, live: 2 })).toBeNull();
    expect(flowsOverPlan({ allowed: 5, live: 1 })).toBeNull();
    expect(flowsOverPlan({ allowed: null, live: 40 })).toBeNull();
    expect(flowsOverPlan(undefined)).toBeNull();
  });
});

describe('a refused run start (POST …/runs 403)', () => {
  const refused = (details?: Record<string, unknown>) => new PlatformError('Access is forbidden', 403, 'FORBIDDEN', details);

  it('over the plan, with its numbers, is the sentence', () => {
    expect(runRefusal(refused({ reason: 'over_plan_limit', limit: 2, live: 4 }))).toEqual({ message: OVER, fileGone: false });
  });

  it('over the plan without usable numbers is the plan-limit line, never a made-up count', () => {
    for (const details of [
      { reason: 'over_plan_limit' },
      { reason: 'over_plan_limit', limit: '2', live: 4 },
      { reason: 'over_plan_limit', limit: 4, live: 4 },
    ]) {
      expect(runRefusal(refused(details)).message).toBe('This workspace has reached its current plan limit.');
    }
  });

  it('with entitlements unconfigured, says runs are unavailable; any other 403 is the platform\'s own words', () => {
    expect(runRefusal(refused({ reason: 'entitlements_not_configured', limit: 0, live: 3 })).message).toBe(RUNS_UNCONFIGURED);
    expect(runRefusal(refused()).message).toBe('Access is forbidden');
  });
});

describe('Flows says when the workspace is over its plan', () => {
  const route = (flowAllowance?: { allowed: number | null; live: number }) =>
    routePlatform(platformOperation, {
      '/automations': flowCatalogPayload(),
      '/subscriptions': { subscriptions: subscriptionsPayload().subscriptions, ...(flowAllowance ? { flowAllowance } : {}) },
    });

  it('above the list, over the plan', async () => {
    route({ allowed: 2, live: 4 });
    await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await screen.findByText(OVER)).toBeTruthy();
    expect(screen.getByTestId('flows-over-plan')).toBeTruthy();
  });

  it('in a team too: the rule is the whole workspace\'s', async () => {
    mockStored.set(TEST_WORKSPACE, 'project-1');
    routePlatform(platformOperation, {
      '/automations': flowCatalogPayload(),
      '/projects': projectsPayload('Finance'),
      '/subscriptions': {
        subscriptions: subscriptionsPayload().subscriptions.map((row) => ({ ...row, projectId: 'project-1' })),
        flowAllowance: { allowed: 2, live: 4 },
      },
    });
    await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await screen.findByText(OVER)).toBeTruthy();
  });

  it.each([
    ['within the plan', { allowed: 4, live: 4 }],
    ['on a plan without a ceiling', { allowed: null, live: 40 }],
    ['when the platform could not say', undefined],
  ] as const)('not %s', async (_case, allowance) => {
    route(allowance);
    await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await screen.findByText('Flows')).toBeTruthy();
    expect(screen.queryByTestId('flows-over-plan')).toBeNull();
  });
});
