import type { SessionContextValue } from '@/hooks/use-session';
import type { Answer } from '@/test/fake-platform';
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

/**
 * The answers below are typed with the published operations' response types
 * (`Answer`, from the generated contracts), never cast: a field the platform
 * drops, renames or retypes fails `npm run typecheck` here, not on a phone.
 */
type Catalog = Answer<'GET /v1/workspaces/{workspaceId}/automations'>;
type CatalogEntry = Catalog['automations'][number];
type Subscriptions = Answer<'GET /v1/workspaces/{workspaceId}/subscriptions'>;
type OneSubscription = Answer<'PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}'>;

/** The design's step kickers as the published step declares them: a BRANCH is an AI step. */
function publishedKicker(design: string): CatalogEntry['pipeline'][number]['kicker'] {
  if (design === 'TRIGGER' || design === 'AI STEP' || design === 'ACTION') return design;
  if (design === 'BRANCH') return 'AI STEP';
  throw new Error(`no published kicker for the design's ${design}`);
}

export const signedInSession: SessionContextValue = {
  status: 'signed-in',
  // The platform's own answer to `GET /v1/session`, typed with it.
  session: {
    authenticated: true,
    user: { userId: 'u1', email: 'alex@acme.co', activeWorkspaceId: TEST_WORKSPACE },
    workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'owner' }],
  } satisfies Answer<'GET /v1/session'>,
  // Past the Face ID lock: a session that is open.
  locked: false,
  unlock: () => {},
  refresh: () => {},
  reload: async () => ({ status: 'signed-in' as const }),
  signIn: async () => ({ status: 'unconfigured', message: '' }),
  signOut: async () => ({ revoked: true }),
};

/** The signed-in session, holding the given role in its one workspace. */
export function sessionAs(role: 'owner' | 'admin' | 'member'): SessionContextValue {
  if (signedInSession.status !== 'signed-in') throw new Error('fixture');
  return {
    ...signedInSession,
    session: {
      ...signedInSession.session,
      workspaces: signedInSession.session.workspaces.map((workspace) => ({ ...workspace, role })),
    },
  };
}

/** The signed-in session, its one workspace the person's own rather than an organization. */
export function personalSession(): SessionContextValue {
  if (signedInSession.status !== 'signed-in') throw new Error('fixture');
  return {
    ...signedInSession,
    session: {
      ...signedInSession.session,
      workspaces: signedInSession.session.workspaces.map(
        (workspace): Answer<'GET /v1/session'>['workspaces'][number] => ({ ...workspace, type: 'personal' }),
      ),
    },
  };
}

/** The catalog, carrying every fixture solution and template. */
export function catalogPayload(): Catalog {
  const automations = solutionDefs.map((sol, i): CatalogEntry => ({
    templateId: `tpl.${i}`,
    version: 1,
    name: sol.name,
    description: sol.desc,
    category: sol.cat,
    icon: 'receipt',
    monthlyPriceUsd: sol.price,
    subscribed: [0, 1, 2].includes(i),
    available: true,
    requiredConnections: [],
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
      kicker: publishedKicker(s.kicker),
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
export function flowCatalogPayload(): Catalog {
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
        kicker: publishedKicker(step.kicker),
        title: step.title,
        description: step.desc,
      })),
    })),
    categories: ['All', 'Finance', 'Ops', 'Sales', 'Reporting'],
  };
}

/**
 * The subscriptions behind `catalogPayload()`'s `subscribed` flags: tpl.0–2,
 * live. Solutions, Settings and Home answer Added from the subscription list
 * (`withoutArchived`), not from the catalog's flag, so a test that means "these
 * three are on the plan" routes `/subscriptions` to this.
 */
export function planSubscriptionsPayload(): Subscriptions & OneSubscription {
  const subscriptions = [0, 1, 2].map((index): Subscriptions['subscriptions'][number] => ({
    id: `solution-${index}`,
    workspaceId: TEST_WORKSPACE,
    templateId: `tpl.${index}`,
    templateVersion: 1,
    status: 'live',
    config: {},
    unmetConnections: [],
    // The version it pins is the catalog's v1, so its settings are that entry's (backend §12.1 #185).
    setup: catalogPayload().automations[index]!.setup,
    // Workspace-wide, made by no one the fixture names (backend 18.6.1).
    projectId: null,
    createdByUserId: null,
    createdAt: '2026-08-17T09:00:00Z',
    updatedAt: '2026-08-17T09:00:00Z',
  }));
  return { subscriptions, subscription: subscriptions[0] };
}

/** One subscription per fixture workflow, keyed so `flow` params resolve. */
export function subscriptionsPayload(): Subscriptions {
  return {
    subscriptions: flowKeys.map((key, i): Subscriptions['subscriptions'][number] => ({
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
      // Pinned at the flow catalog's v1, whose settings every entry shares (backend §12.1 #185).
      setup: catalogPayload().automations[0]!.setup,
      projectId: null,
      createdByUserId: null,
      createdAt: '2026-08-17T09:00:00Z',
      updatedAt: '2026-08-17T09:00:00Z',
    })),
  };
}

/**
 * Teams of the test workspace (projects in the contract), by kind — for the
 * screens that scope by team. A team is its kind since 24.12: the kind is sent
 * as both its name and its type.
 */
export function projectsPayload(...kinds: string[]): Answer<'GET /v1/workspaces/{workspaceId}/projects'> {
  return {
    projects: kinds.map((kind, index) => ({
      id: `project-${index + 1}`,
      workspaceId: TEST_WORKSPACE,
      name: kind,
      type: kind,
      status: 'active',
      viewerRole: 'owner',
      createdAt: '2026-09-01T00:00:00Z',
    })),
  };
}

/** Counts that reproduce the fixtures' own summary lines. */
export function runStatsPayload(): Answer<'GET /v1/workspaces/{workspaceId}/run-stats'> {
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

export function runsPayload(): Answer<'GET /v1/workspaces/{workspaceId}/runs'> {
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

export function approvalsPayload(): Answer<'GET /v1/workspaces/{workspaceId}/approvals'> {
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

/**
 * The platform's inbox (the owner's build 13 decision 3A): the held runs
 * `approvalsPayload` holds, then the failed run `runsPayload` holds, none read —
 * the rows the inbox drew when it composed them from those two reads.
 */
export function inboxPayload(): Answer<'GET /v1/workspaces/{workspaceId}/notifications'> {
  const templates = new Map(subscriptionsPayload().subscriptions.map((s) => [s.id, s.templateId]));
  const held = approvalsPayload().approvals.map((approval) => ({
    id: `approval:${approval.id}`,
    kind: 'approval-requested' as const,
    runId: approval.runId,
    approvalId: approval.id,
    subscriptionId: approval.subscriptionId,
    templateId: templates.get(approval.subscriptionId) ?? 'tpl.0',
    stepId: approval.stepId,
    reason: approval.reason,
    occurredAt: approval.createdAt,
    read: false,
  }));
  const failed = runsPayload()
    .runs.filter((run) => run.status === 'failed')
    .map((run) => ({
      id: `run:${run.id}`,
      kind: 'run-failed' as const,
      runId: run.id,
      subscriptionId: run.subscriptionId,
      templateId: run.templateId,
      ...(run.failureReason ? { failureReason: run.failureReason } : {}),
      occurredAt: run.updatedAt,
      read: false,
    }));
  const items = [...held, ...failed];
  return { items, unreadCount: items.length };
}

/** `RunDetail` — a different shape from the runs list, and easy to conflate. */
export function runDetailPayload(runId: string): Answer<'GET /v1/workspaces/{workspaceId}/runs/{runId}'> {
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


export function connectionsPayload(): Answer<'GET /v1/workspaces/{workspaceId}/connections'> {
  return { connections: [] };
}

export function providersPayload(): Answer<'GET /v1/connections/providers'> {
  return {
    providers: [
      { providerId: 'hubspot', displayName: 'HubSpot', description: '', scopes: [], authType: 'oauth2', icon: 'plugs' },
    ],
  };
}

type Billing = Answer<'GET /v1/workspaces/{workspaceId}/billing'>;

/**
 * What a test may answer in place of `routePlatform`'s own, by the end of the
 * path it answers — each typed with the operation it stands for, and given to
 * that operation only (a list's answer never reaches a decision or a cancel
 * below it). The one exception is `/subscriptions`, which also answers one
 * subscription's create and PATCH, so its body may carry the `subscription`
 * those answer. A workspace's billing and connections are named by their path.
 */
export type RouteOverrides = {
  '/v1/workspaces'?: Answer<'GET /v1/workspaces'>;
  '/automations'?: Catalog;
  '/subscriptions'?: Subscriptions & Partial<OneSubscription>;
  '/projects'?: Answer<'GET /v1/workspaces/{workspaceId}/projects'>;
  '/approvals'?: Answer<'GET /v1/workspaces/{workspaceId}/approvals'>;
  '/decision'?: Answer<'POST /v1/workspaces/{workspaceId}/approvals/{approvalId}/decision'>;
  '/runs'?: Answer<'GET /v1/workspaces/{workspaceId}/runs'>;
  '/run-stats'?: Answer<'GET /v1/workspaces/{workspaceId}/run-stats'>;
  '/notifications'?: Answer<'GET /v1/workspaces/{workspaceId}/notifications'>;
} & { [billing: `/v1/workspaces/${string}/billing`]: Billing } & {
  [connections: `${string}/connections`]: Answer<'GET /v1/workspaces/{workspaceId}/connections'>;
};

/**
 * An answer the published contract does not allow, given on purpose: a platform
 * from before a field was published, so a test can hold what the app does with
 * it. The one way past the types here — named, so it is never an accident.
 */
export function unpublishedAnswer<T>(answer: object): T {
  return answer as T;
}

/**
 * Route a mocked `platformOperation` by path.
 *
 * Screens make several reads in parallel, so answering every path with one body
 * silently feeds a screen the wrong shape — a mistake that already cost one
 * debugging pass. Routing keeps each read honest, and every answer is the
 * published operation's: a path nothing here answers is refused, never answered
 * with an invented `{}`.
 */
export function routePlatform(platformOperation: jest.Mock, overrides: RouteOverrides = {}) {
  platformOperation.mockImplementation((path: string) => {
    const bare = path.split('?')[0]!;
    for (const [fragment, body] of Object.entries(overrides)) {
      const one = fragment === '/subscriptions' && /\/subscriptions\/[^/]+$/.test(bare);
      if (bare.endsWith(fragment) || one) return Promise.resolve(body);
    }
    if (path.includes('/automations')) return Promise.resolve(catalogPayload());
    // No projects unless a test says so: without one, scopes are not drawn.
    if (path.endsWith('/projects')) {
      return Promise.resolve({ projects: [] } satisfies Answer<'GET /v1/workspaces/{workspaceId}/projects'>);
    }
    // Nor a team directory: with no team, Setup reads it (F84) and finds none to ask onto.
    if (path.endsWith('/project-directory')) {
      return Promise.resolve({ projects: [] } satisfies Answer<'GET /v1/workspaces/{workspaceId}/project-directory'>);
    }
    // One team, read by its id, when a screen opens it.
    const team = /^\/v1\/workspaces\/([^/]+)\/projects\/([^/?]+)$/.exec(path);
    if (team) {
      return Promise.resolve({
        project: {
          id: team[2],
          workspaceId: team[1],
          name: 'Finance',
          type: 'Finance',
          status: 'active',
          viewerRole: 'owner',
          createdAt: '2026-09-01T00:00:00Z',
        },
      } satisfies Answer<'GET /v1/workspaces/{workspaceId}/projects/{projectId}'>);
    }
    // A workspace's billing: the free floor, as the platform answers one that has never paid.
    const billing = /^\/v1\/workspaces\/([^/]+)\/billing$/.exec(path);
    if (billing) {
      return Promise.resolve({ workspaceId: billing[1], planId: 'free', displayName: 'Free' } satisfies Billing);
    }
    if (path === '/v1/auth/providers') {
      return Promise.resolve({
        providers: [
          { id: 'apple', label: 'Apple' },
          { id: 'google', label: 'Google' },
          { id: 'microsoft', label: 'Microsoft' },
        ],
        passwordLoginEnabled: false,
        magicLinkLoginEnabled: false,
      } satisfies Answer<'GET /v1/auth/providers'>);
    }
    if (/\/subscriptions\/[^/?]+$/.test(path)) {
      return Promise.resolve({ subscription: subscriptionsPayload().subscriptions[0] } satisfies OneSubscription);
    }
    if (path.includes('/subscriptions')) {
      const rows = subscriptionsPayload().subscriptions;
      return Promise.resolve({ subscriptions: rows, subscription: rows[0] } satisfies Subscriptions & OneSubscription);
    }
    // The inbox (decision 3A): its list, and what a read or a dismissal of it answers.
    if (/\/notifications\/read$/.test(path)) {
      return Promise.resolve({ unreadCount: 0 } satisfies Answer<'POST /v1/workspaces/{workspaceId}/notifications/read'>);
    }
    if (/\/notifications\/[^/]+\/dismiss$/.test(path)) {
      return Promise.resolve({
        unreadCount: inboxPayload().unreadCount - 1,
      } satisfies Answer<'POST /v1/workspaces/{workspaceId}/notifications/{notificationId}/dismiss'>);
    }
    if (path.endsWith('/notifications')) return Promise.resolve(inboxPayload());
    if (path.includes('/run-stats')) return Promise.resolve(runStatsPayload());
    // The workspace collection, where a screen reads the person's role (Approvals,
    // for an approval's eligible roles — Gate 24's parity pass): the signed-in
    // session's one workspace, held as `signedInSession` holds it.
    if (path === '/v1/workspaces') {
      return Promise.resolve({
        workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'owner' }],
        activeWorkspaceId: TEST_WORKSPACE,
      } satisfies Answer<'GET /v1/workspaces'>);
    }
    if (path.includes('/decision')) {
      return Promise.resolve({
        approval: approvalsPayload().approvals[0],
      } satisfies Answer<'POST /v1/workspaces/{workspaceId}/approvals/{approvalId}/decision'>);
    }
    if (path.includes('/approvals')) return Promise.resolve(approvalsPayload());
    // Order matters: /runs/{id} is a different shape from /runs.
    const detail = /\/runs\/([^/?]+)$/.exec(path);
    if (detail) return Promise.resolve(runDetailPayload(detail[1]));
    if (path.includes('/runs')) return Promise.resolve(runsPayload());
    if (path.includes('/connections/providers')) return Promise.resolve(providersPayload());
    if (path.includes('/connections')) return Promise.resolve(connectionsPayload());
    return Promise.reject(new Error(`routePlatform answers no ${path}`));
  });
}
