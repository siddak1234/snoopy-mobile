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
    // The account answered "AI reads your documents" (backend ADR-0038): no card over the screens under test.
    user: { userId: 'u1', email: 'alex@acme.co', activeWorkspaceId: TEST_WORKSPACE, aiDocumentReading: 'allowed' },
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
    usesAi: false,
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
    categories: ['All', 'Finance', 'Operations', 'Sales', 'Data'],
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
    categories: ['All', 'Finance', 'Operations', 'Sales', 'Data'],
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

/**
 * The runs list paged to the parameters (backend ADR-0048 amendment 1, point 4;
 * `listRuns` in docs/openapi/automations.yaml): with none of `q`, `status`,
 * `needsReview`, `since`, `sort` and `page`, today's newest 100; with any, one
 * page of 25 and `total` — the flow (`subscriptionId`), `status` and `since`
 * (made at or after it) as plain field matches, newest or oldest first.
 *
 * `q` and `needsReview` are **not** selected here. The platform's rules for
 * them — `q` also matches a job's documents' sellers, `needsReview` reads the
 * newest approval in the job's whole chain — are the backend's, proved by its
 * own route tests; a copy written here would prove itself (Round 21's review).
 * A test of them asserts what the screen sends, and draws the answer as given.
 */
export function runsAsSelected(
  runs: readonly Answer<'GET /v1/workspaces/{workspaceId}/runs'>['runs'][number][],
): (path: string) => Answer<'GET /v1/workspaces/{workspaceId}/runs'> {
  return (path) => {
    const query = new URLSearchParams(path.split('?')[1] ?? '');
    const flow = query.get('subscriptionId');
    const flowRuns = flow ? runs.filter((run) => run.subscriptionId === flow) : [...runs];
    const paged = ['q', 'status', 'needsReview', 'since', 'sort', 'page'].some((name) => query.has(name));
    if (!paged) return { runs: flowRuns.slice(0, 100) };
    const status = query.get('status');
    const since = query.get('since');
    const matching = flowRuns
      .filter((run) => !status || run.status === status)
      .filter((run) => !since || run.createdAt >= since);
    const ordered = [...matching].sort((a, b) =>
      query.get('sort') === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt),
    );
    const page = Number(query.get('page') ?? '1');
    return { runs: ordered.slice((page - 1) * 25, page * 25), total: matching.length };
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
/**
 * A run's result line as the platform's page body says it (backend ADR-0048
 * decision 6, `outcome`): a succeeded run's summary toned success, a failed
 * one's reason toned error — the one block every read of a run here carries.
 */
export function outcomeBlocks(run: { status: string; resultSummary?: string; failureReason?: string }) {
  if (run.status === 'succeeded' && run.resultSummary) return [{ type: 'text' as const, text: run.resultSummary, tone: 'success' as const }];
  if (run.status === 'failed' && run.failureReason) return [{ type: 'text' as const, text: run.failureReason, tone: 'error' as const }];
  return [];
}

export function runDetailPayload(runId: string): Answer<'GET /v1/workspaces/{workspaceId}/runs/{runId}'> {
  const all = runsPayload().runs;
  const run = all.find((r) => r.id === runId) ?? all[0];
  return {
    run: { ...run, startedAt: run.createdAt, endedAt: run.updatedAt },
    // The page body (`shape=blocks`, backend ADR-0048): its result line.
    blocks: outcomeBlocks(run),
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

/** QuickBooks as the platform lists it since 25.4.18: its icon names its own logo. */
export const QUICKBOOKS_PROVIDER: Answer<'GET /v1/connections/providers'>['providers'][number] = {
  providerId: 'quickbooks',
  displayName: 'QuickBooks Online',
  description: 'Records bills and receipts.',
  scopes: ['com.intuit.quickbooks.accounting'],
  authType: 'oauth2',
  icon: 'QuickBooksLogo',
};

/** The providers with QuickBooks among them. */
export function providersWithQuickBooks(): Answer<'GET /v1/connections/providers'> {
  return { providers: [...providersPayload().providers, QUICKBOOKS_PROVIDER] };
}

/**
 * Invoice Processing v2 as the catalog publishes it (backend ADR-0036–0038;
 * the spec's §2.1): Accounting, QuickBooks optional, the vendor choice a
 * `connection` setting defaulting to None, two settings, five step groups, and
 * AI reading its file.
 */
export function invoiceProcessingEntry(): CatalogEntry {
  const step = (id: string, kicker: CatalogEntry['pipeline'][number]['kicker'], group: string, title: string, description: string) => ({
    id,
    kicker,
    group,
    title,
    description,
  });
  return {
    templateId: 'invoice-processing',
    version: 2,
    name: 'Invoice Processing',
    description: 'Reads bills and receipts, then saves the details or records them in QuickBooks.',
    category: 'Accounting',
    icon: 'Receipt',
    // Its words for its documents, as its manifest declares them from v7 (backend BUILD-PLAN 27.2.1).
    documentWords: { singular: 'Invoice', plural: 'Invoices' },
    monthlyPriceUsd: 0,
    subscribed: false,
    available: true,
    usesAi: true,
    requiredConnections: [
      { providerId: 'quickbooks', displayName: 'QuickBooks Online', purpose: 'Records bills and receipts.', optional: true },
    ],
    setup: [
      { section: 'connections', key: 'vendor', title: 'Vendor', description: 'Where the details go.', control: 'connection', defaultValue: 'none', required: false },
      { section: 'rules', key: 'holdAboveAmount', title: 'Approval limit', description: 'Amounts over this wait for approval.', control: 'money', defaultValue: 500, required: false },
      { section: 'notifications', key: 'notifyEmail', title: 'Also email', description: 'Gets a short summary of each one.', control: 'email', required: false },
    ],
    groups: [
      { id: 'received', title: 'Received', description: 'You add a PDF or photo.' },
      { id: 'read', title: 'Read', description: 'AI reads the details.' },
      { id: 'checked', title: 'Checked', description: 'Totals and duplicates are checked.' },
      { id: 'done', title: 'Done', description: 'Saved, or recorded in QuickBooks.' },
      { id: 'emailed', title: 'Emailed', description: 'A summary goes to Also email.' },
    ],
    pipeline: [
      step('receive', 'TRIGGER', 'received', 'Document received', 'A PDF or photo arrives.'),
      step('read-company', 'ACTION', 'received', 'QuickBooks checked', 'Checks QuickBooks is connected.'),
      step('extract', 'AI STEP', 'read', 'Document read', 'AI reads the details.'),
      step('check-document', 'ACTION', 'checked', 'Details checked', 'Checks totals and dates.'),
      step('verify-read', 'AI STEP', 'read', 'Read again', 'Only when something looks wrong.'),
      step('find-vendor', 'ACTION', 'checked', 'Vendor looked up', 'Finds the vendor in QuickBooks.'),
      step('decide', 'ACTION', 'checked', 'Record in QuickBooks?', 'Records it, or waits for approval.'),
      step('save-details', 'ACTION', 'done', 'Details saved', 'Saves the details for your team.'),
      step('notify', 'ACTION', 'emailed', 'Summary emailed', 'Sends a summary to Also email.'),
    ],
  };
}

/**
 * Invoice Processing v3 as the spec draws it (Build 21, spec §3.1–§3.2, with
 * the owner's AM3: no "Send results to" setting, so no Emailed group and no
 * notify step): the vendor choice names QuickBooks and the Done step
 * (`providers`, `group`, backend ADR-0040), the Approval limit the Checked
 * step, four groups, and the 22 steps in their groups' order.
 */
export function invoiceProcessingV3Entry(): CatalogEntry {
  const v2 = invoiceProcessingEntry();
  const step = (id: string, kicker: CatalogEntry['pipeline'][number]['kicker'], group: string, title: string) => ({
    id,
    kicker,
    group,
    title,
    description: title,
  });
  return {
    ...v2,
    version: 3,
    setup: [
      { section: 'connections', key: 'vendor', title: 'Vendor', description: 'Where the details go.', control: 'connection', defaultValue: 'none', required: false, providers: ['quickbooks'], group: 'done' },
      { section: 'rules', key: 'holdAboveAmount', title: 'Approval limit', description: 'Amounts over this wait for approval.', control: 'money', defaultValue: 500, required: false, group: 'checked' },
    ],
    groups: [
      { id: 'received', title: 'Received', description: 'Add a PDF or photo.' },
      { id: 'read', title: 'Read', description: 'AI reads each bill or receipt.' },
      { id: 'checked', title: 'Checked', description: 'Totals and duplicates are checked.' },
      { id: 'done', title: 'Done', description: 'Saved, or recorded in QuickBooks.' },
    ],
    pipeline: [
      step('receive', 'TRIGGER', 'received', 'Document received'),
      step('extract', 'AI STEP', 'read', 'Documents read'),
      step('check-documents', 'ACTION', 'read', 'Documents checked'),
      step('verify-read', 'AI STEP', 'read', 'Read again'),
      step('read-company', 'ACTION', 'checked', 'QuickBooks checked'),
      step('read-preferences', 'ACTION', 'checked', 'QuickBooks settings read'),
      step('find-accounts', 'ACTION', 'checked', 'Accounts read'),
      step('find-vendors', 'ACTION', 'checked', 'Vendors looked up'),
      step('find-names', 'ACTION', 'checked', 'Names checked'),
      step('find-duplicates', 'ACTION', 'checked', 'Duplicates checked'),
      step('find-related', 'ACTION', 'checked', 'Related records looked up'),
      step('decide', 'ACTION', 'checked', 'Ready to record?'),
      step('create-vendors', 'ACTION', 'done', 'Vendors added'),
      step('create-records', 'ACTION', 'done', 'Recorded in QuickBooks'),
      step('save-documents', 'ACTION', 'done', 'Details saved'),
      step('ask-approval', 'ACTION', 'done', 'Needs your approval'),
      step('confirm-company', 'ACTION', 'done', 'Company checked again'),
      step('confirm-vendors', 'ACTION', 'done', 'Vendors checked again'),
      step('create-approved-vendors', 'ACTION', 'done', 'Approved vendors added'),
      step('confirm-no-duplicates', 'ACTION', 'done', 'Duplicates checked again'),
      step('create-approved-records', 'ACTION', 'done', 'Approved documents recorded'),
      step('save-approved', 'ACTION', 'done', 'Approved details saved'),
    ],
  };
}

/**
 * Invoice Processing v4 as the round's manifest declares it (Build 22, spec §3;
 * `snoopy-automations/manifests/invoice-processing.v4.json`): v3's 22 steps and settings' keys, in five
 * steps — Upload invoice (receive); Connect integration, a setting step the
 * `vendor` field names ("Integration"); AI processing (extract, check-documents,
 * verify-read); Details saved, "QuickBooks updated" while QuickBooks is chosen
 * (`titleByConnection`), holding the other 18; and Email sent, the platform's
 * (`platform: email`). The Approval limit names no step.
 */
export function invoiceProcessingV4Entry(): CatalogEntry {
  const v3 = invoiceProcessingV3Entry();
  const groupOf = (id: string) =>
    id === 'receive' ? 'upload' : ['extract', 'check-documents', 'verify-read'].includes(id) ? 'process' : 'record';
  return {
    ...v3,
    version: 4,
    setup: [
      { section: 'connections', key: 'vendor', title: 'Integration', description: 'Where the details go.', control: 'connection', defaultValue: 'none', required: false, providers: ['quickbooks'], group: 'connect' },
      { section: 'rules', key: 'holdAboveAmount', title: 'Approval limit', description: 'Amounts over this wait for approval.', control: 'money', defaultValue: 500, required: false },
    ],
    groups: [
      { id: 'upload', title: 'Upload invoice', description: 'Add a PDF or photo.' },
      { id: 'connect', title: 'Connect integration', description: 'QuickBooks, or None.' },
      { id: 'process', title: 'AI processing', description: 'AI reads and checks each document.' },
      {
        id: 'record',
        title: 'Details saved',
        description: 'Saved, or recorded in QuickBooks.',
        titleByConnection: { field: 'vendor', titles: [{ providerId: 'quickbooks', title: 'QuickBooks updated' }] },
      },
      { id: 'email', title: 'Email sent', description: 'The results are emailed.', platform: 'email' },
    ],
    pipeline: v3.pipeline.map((step) => ({ ...step, group: groupOf(step.id) })),
  };
}

/**
 * Who a flow's run emails go to (Build 22, P5): the workspace's owners and
 * admins, owners first, and its extra addresses — every one an example.com
 * address, never a real person's in a public repository.
 */
export function recipientsPayload(
  overrides: Partial<Answer<'GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/email-recipients'>> = {},
): Answer<'GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/email-recipients'> {
  return {
    subscriptionId: 'ip-1',
    people: [
      { email: 'owner@example.com', displayName: 'Olive Owner', role: 'owner' },
      { email: 'admin@example.com', role: 'admin' },
    ],
    extra: ['ap@example.com'],
    canEdit: true,
    ...overrides,
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
  /** The runs list, or how the platform answers it to the path's parameters (`runsAsSelected`). */
  '/runs'?: Answer<'GET /v1/workspaces/{workspaceId}/runs'> | ((path: string) => Answer<'GET /v1/workspaces/{workspaceId}/runs'>);
  '/run-stats'?: Answer<'GET /v1/workspaces/{workspaceId}/run-stats'>;
  '/notifications'?: Answer<'GET /v1/workspaces/{workspaceId}/notifications'>;
  '/connections/providers'?: Answer<'GET /v1/connections/providers'>;
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
      if (bare.endsWith(fragment) || one) {
        if (typeof body === 'function') return Promise.resolve(body(path));
        // The runs list asked with Activity's parameters: paged from the rows given (`runsAsSelected`).
        if (fragment === '/runs' && path.includes('?')) {
          return Promise.resolve(runsAsSelected((body as Answer<'GET /v1/workspaces/{workspaceId}/runs'>).runs)(path));
        }
        return Promise.resolve(body);
      }
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
    // A flow's email recipients (Build 22, P5): before a flow's own path, which it extends.
    if (/\/subscriptions\/[^/?]+\/email-recipients$/.test(path)) return Promise.resolve(recipientsPayload());
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
    if (path.includes('/runs')) {
      return Promise.resolve(path.includes('?') ? runsAsSelected(runsPayload().runs)(path) : runsPayload());
    }
    if (path.includes('/connections/providers')) return Promise.resolve(providersPayload());
    if (path.includes('/connections')) return Promise.resolve(connectionsPayload());
    return Promise.reject(new Error(`routePlatform answers no ${path}`));
  });
}
