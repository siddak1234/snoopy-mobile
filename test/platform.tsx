import type { SessionContextValue } from '@/hooks/use-session';
import {
  activityToday,
  activityYesterday,
  approvals,
  flowDefs,
  flowKeys,
  solutionDefs,
  templates,
} from '@/test/design-data';

/**
 * A signed-in session and platform payloads built FROM the fixtures.
 *
 * The screens no longer read `lib/fixtures` — the owner's 2026-08-17 decision
 * deleted every prototype fallback — but Gate 8's wording is "0 imports outside
 * **tests**", and a test may read them. That exemption is what lets these suites
 * keep asserting the design's own strings ("Invoice triage", "1,284 runs · 1,272
 * ok · 12 failed") while exercising the REAL path: a real session, the real
 * transport facade mocked at its boundary, and the real wire→view mapping.
 *
 * The point is worth stating because it is easy to get backwards: the fixtures
 * are now *test data*, not app data. They describe what the design draws, so a
 * payload shaped from them proves the mapping renders the design — which is
 * exactly what these tests were written to prove, and stronger than before,
 * since the values now travel through the mappers rather than straight to JSX.
 */

export const TEST_WORKSPACE = '00000000-0000-4000-8000-000000000001';

export const signedInSession: SessionContextValue = {
  status: 'signed-in',
  session: {
    user: { userId: 'u1', email: 'alex@acme.co', activeWorkspaceId: TEST_WORKSPACE },
    workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', role: 'owner' }],
  },
  refresh: () => {},
  signIn: async () => ({ status: 'unconfigured', message: '' }),
  signOut: async () => ({ revoked: true }),
} as unknown as SessionContextValue;

/** The catalog, carrying every fixture solution and template. */
export function catalogPayload() {
  const automations = solutionDefs.map((sol, i) => ({
    templateId: `tpl.${i}`,
    version: 1,
    name: sol.name,
    description: sol.desc,
    category: sol.cat,
    icon: 'receipt',
    monthlyPriceUsd: sol.price,
    subscribed: [0, 1, 2].includes(i),
    available: true,
    setup: [
      {
        section: 'connections',
        key: 'account',
        title: 'QuickBooks Online',
        description: 'Required · sign in with OAuth once',
        control: 'toggle',
        required: true,
      },
      {
        section: 'source',
        key: 'inbox',
        title: 'Watch inbox',
        description: 'ap@acme.co · label "AP-Invoices"',
        control: 'resource-picker',
        required: true,
      },
    ],
    pipeline: flowDefs.invoice.steps.map((s, n) => ({
      id: `step-${n}`,
      kicker: s.kicker === 'BRANCH' ? 'AI STEP' : s.kicker,
      title: s.title,
      description: s.desc,
    })),
  }));

  // Templates the Templates screen lists, beyond the marketplace's six.
  for (const [i, t] of templates.entries()) {
    if (!automations.some((a) => a.name === t.name)) {
      automations.push({
        ...automations[0],
        templateId: `tplx.${i}`,
        name: t.name,
        category: t.cat,
        // Not on the plan: inheriting automations[0]'s `subscribed` would inflate
        // every plan total the Solutions and Settings screens compute.
        subscribed: false,
      });
    }
  }

  return {
    automations,
    categories: ['All', 'Finance', 'Ops', 'Sales', 'Reporting'],
  };
}

/**
 * The catalog a FLOW screen sees: one entry per fixture workflow.
 *
 * Solutions, Templates and Flows all read one catalog in reality, but the
 * prototype's `solutionDefs` and `flowDefs` are different sets, so a single
 * payload cannot satisfy assertions written against both. Tests asserting flow
 * content pass this through `routePlatform`'s overrides.
 */
export function flowCatalogPayload() {
  const base = catalogPayload().automations[0];
  return {
    automations: flowKeys.map((key) => ({
      ...base,
      templateId: `tplflow.${key}`,
      name: flowDefs[key].name,
      description: flowDefs[key].desc,
      subscribed: false,
      pipeline: flowDefs[key].steps.map((step, n) => ({
        id: `step-${n}`,
        kicker: step.kicker === 'BRANCH' ? 'AI STEP' : step.kicker,
        title: step.title,
        description: step.desc,
      })),
    })),
    categories: ['All', 'Finance', 'Ops', 'Sales', 'Reporting'],
  };
}

/** One subscription per fixture workflow, keyed so `flow` params resolve. */
export function subscriptionsPayload() {
  return {
    subscriptions: flowKeys.map((key, i) => ({
      id: key,
      workspaceId: TEST_WORKSPACE,
      // A distinct template each, so workflow detail shows its OWN content.
      templateId: `tplflow.${key}`,
      templateVersion: 1,
      name: flowDefs[key].name,
      status:
        flowDefs[key].status === 'Live'
          ? 'live'
          : flowDefs[key].status === 'Paused'
            ? 'paused'
            : 'draft',
      config: {},
      unmetConnections: flowDefs[key].status === 'Draft' ? ['hubspot'] : [],
      createdAt: '2026-08-17T09:00:00Z',
      updatedAt: '2026-08-17T09:00:00Z',
    })),
  };
}

/** Counts that reproduce the fixtures' own summary lines. */
export function runStatsPayload() {
  return {
    workspace: {
      total: 128,
      pending: 0,
      running: 0,
      held: 0,
      succeeded: 124,
      failed: 4,
      cancelled: 0,
    },
    subscriptions: flowKeys
      .filter((k) => flowDefs[k].status !== 'Draft')
      .map((k) => ({
        subscriptionId: k,
        total: Number(flowDefs[k].runCount.replace(/,/g, '')) || 0,
        pending: 0,
        running: 0,
        held: 0,
        succeeded: Number(flowDefs[k].okCount.replace(/,/g, '')) || 0,
        failed: Number(flowDefs[k].failCount.replace(/,/g, '')) || 0,
        cancelled: 0,
      })),
  };
}

export function runsPayload() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const rows = [
    ...activityToday.map((item) => ({ item, at: new Date() })),
    ...activityYesterday.map((item) => ({ item, at: yesterday })),
  ];
  return {
    runs: rows.map(({ item, at }, i) => ({
      id: `run-${i}`,
      workspaceId: TEST_WORKSPACE,
      subscriptionId: 'invoice',
      templateId: 'tpl.0',
      templateVersion: 1,
      status: item.tone === 'ok' ? 'succeeded' : item.tone === 'err' ? 'failed' : 'held',
      origin: 'trigger',
      rootRunId: `run-${i}`,
      requestId: `req-${i}`,
      resultSummary: item.tone === 'ok' ? item.desc : undefined,
      failureReason: item.tone === 'err' ? item.desc : undefined,
      createdAt: at.toISOString(),
      updatedAt: at.toISOString(),
    })),
  };
}

export function approvalsPayload() {
  return {
    approvals: approvals.map((a, i) => ({
      id: `apr-${i}`,
      runId: `run-${i}`,
      workspaceId: TEST_WORKSPACE,
      subscriptionId: 'invoice',
      stepId: `step-${i}`,
      status: 'pending',
      reason: a.why,
      eligibleRoles: ['owner'],
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
    })),
  };
}

/** `RunDetail` — a different shape from the runs list, and easy to conflate. */
export function runDetailPayload(runId: string) {
  const all = runsPayload().runs;
  const run = all.find((r) => r.id === runId) ?? all[0];
  return {
    run: { ...run, startedAt: run.createdAt, endedAt: run.updatedAt },
    steps: [
      {
        id: 's1',
        runId: run.id,
        workspaceId: TEST_WORKSPACE,
        stepId: 'step-0',
        outcome: 'ok',
        summary: 'Gmail · ap@acme.co',
        occurredAt: run.createdAt,
      },
    ],
    events: [],
  };
}


export function connectionsPayload() {
  return { connections: [] };
}

export function providersPayload() {
  return {
    providers: [
      { providerId: 'hubspot', displayName: 'HubSpot', description: '', scopes: [], authType: 'oauth2', icon: 'plugs' },
    ],
  };
}

/**
 * Route a mocked `platformOperation` by path.
 *
 * Screens make several reads in parallel, so answering every path with one body
 * silently feeds a screen the wrong shape — a mistake that already cost one
 * debugging pass. Routing keeps each read honest.
 */
export function routePlatform(platformOperation: jest.Mock, overrides: Record<string, unknown> = {}) {
  platformOperation.mockImplementation((path: string) => {
    for (const [fragment, body] of Object.entries(overrides)) {
      if (path.includes(fragment)) return Promise.resolve(body);
    }
    if (path.includes('/automations')) return Promise.resolve(catalogPayload());
    if (path === '/v1/auth/providers') {
      return Promise.resolve({
        providers: [
          { id: 'apple', label: 'Apple' },
          { id: 'google', label: 'Google' },
          { id: 'microsoft', label: 'Microsoft' },
        ],
        passwordLoginEnabled: false,
        magicLinkLoginEnabled: false,
      });
    }
    if (/\/subscriptions\/[^/?]+$/.test(path)) {
      return Promise.resolve({ subscription: subscriptionsPayload().subscriptions[0] });
    }
    if (path.includes('/subscriptions')) {
      const rows = subscriptionsPayload().subscriptions;
      return Promise.resolve({ subscriptions: rows, subscription: rows[0] });
    }
    if (path.includes('/run-stats')) return Promise.resolve(runStatsPayload());
    if (path.includes('/decision')) {
      return Promise.resolve({ approval: approvalsPayload().approvals[0] });
    }
    if (path.includes('/approvals')) return Promise.resolve(approvalsPayload());
    // Order matters: /runs/{id} is a different shape from /runs.
    const detail = /\/runs\/([^/?]+)$/.exec(path);
    if (detail) return Promise.resolve(runDetailPayload(detail[1]));
    if (path.includes('/runs')) return Promise.resolve(runsPayload());
    if (path.includes('/connections/providers')) return Promise.resolve(providersPayload());
    if (path.includes('/connections')) return Promise.resolve(connectionsPayload());
    return Promise.resolve({});
  });
}
