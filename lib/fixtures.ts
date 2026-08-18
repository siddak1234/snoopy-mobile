/**
 * Prototype fixture data, verbatim from the design's screen logic
 * (Screen.dc.html — DCLogic renderVals). The design is a clickable prototype
 * over this data; keep strings byte-identical to the design.
 */
import {
  ArrowClockwise,
  BellRinging,
  Camera,
  ChartLine,
  CheckCircle,
  CircleDashed,
  CrownSimple,
  EnvelopeOpen,
  EnvelopeSimple,
  GitBranch,
  HandPalm,
  Lightning,
  PlugsConnected,
  Receipt,
  SlackLogo,
  Sparkle,
  Table,
  Timer,
  UserPlus,
  XCircle,
  type Icon,
} from 'phosphor-react-native';

// The view models these fixtures populate are owned by `lib/view`, so the
// components that render them do not depend on this module. Re-exported here
// because the prototype's screens still import them from one place.
import type { PipelineStep } from '@/lib/view/pipeline';
import type { FlowStatus } from '@/lib/view/status';

export type { FlowStatus, PipelineStep };

/** Stable identity for each workflow (design `flow` prop enum). */
export type FlowKey = 'invoice' | 'email' | 'kpi' | 'lead';

export const flowKeys: FlowKey[] = ['invoice', 'email', 'kpi', 'lead'];

export type FlowConnection = {
  icon: Icon;
  name: string;
  sub: string;
  /** Connection tone (design conns[].sc): ok, warn (needs reconnect), neutral. */
  tone: 'ok' | 'warn' | 'neutral';
  status: string;
};

export type FlowDef = {
  icon: Icon;
  name: string;
  desc: string;
  status: FlowStatus;
  /** List-row summary line (design runsTxt). */
  runs: string;
  /** Detail stat tiles (design runs / okN / failN — em dash on a Draft). */
  runCount: string;
  okCount: string;
  failCount: string;
  connections: FlowConnection[];
  steps: PipelineStep[];
};

/** Per-workflow content (design flowDefs) — each list card opens its own detail. */
export const flowDefs: Record<FlowKey, FlowDef> = {
  invoice: {
    icon: Receipt,
    name: 'Invoice triage',
    desc: 'AP inbox → QuickBooks',
    status: 'Live',
    runs: '1,284 runs · 1,272 ok · 12 failed',
    runCount: '1,284',
    okCount: '1,272',
    failCount: '12',
    connections: [
      { icon: PlugsConnected, name: 'QuickBooks Online', sub: 'acme-books · linked via OAuth', tone: 'ok', status: 'Connected' },
      { icon: EnvelopeSimple, name: 'Gmail', sub: 'ap@acme.co · shared across workspace', tone: 'ok', status: 'Connected' },
    ],
    steps: [
      { id: 'invoice-trigger', icon: EnvelopeOpen, kicker: 'TRIGGER', title: 'New email in AP inbox', desc: 'Gmail · ap@acme.co', more: true },
      { id: 'invoice-extract', icon: Sparkle, kicker: 'AI STEP', title: 'Extract invoice fields', desc: 'Vendor, amount, PO, due date', more: true },
      { id: 'invoice-classify', icon: GitBranch, kicker: 'AI STEP', title: 'Classify & GL-code', desc: 'Low confidence → human review', more: true },
      { id: 'invoice-post', icon: PlugsConnected, kicker: 'ACTION', title: 'Post to QuickBooks', desc: 'Draft bill, attach PDF', more: false },
    ],
  },
  email: {
    icon: EnvelopeSimple,
    name: 'Email triage',
    desc: 'Support inbox routing',
    status: 'Live',
    runs: '3,412 runs · 3,357 ok · 55 failed',
    runCount: '3,412',
    okCount: '3,357',
    failCount: '55',
    connections: [
      { icon: EnvelopeSimple, name: 'Gmail', sub: 'support@acme.co · shared across workspace', tone: 'ok', status: 'Connected' },
    ],
    steps: [
      { id: 'email-trigger', icon: EnvelopeOpen, kicker: 'TRIGGER', title: 'New support email', desc: 'Gmail · support@acme.co', more: true },
      { id: 'email-classify', icon: Sparkle, kicker: 'AI STEP', title: 'Classify intent & urgency', desc: 'Billing, bug, refund, other', more: true },
      { id: 'email-escalate', icon: GitBranch, kicker: 'BRANCH', title: 'Escalate if urgent', desc: 'Urgent → on-call channel', more: true },
      { id: 'email-route', icon: PlugsConnected, kicker: 'ACTION', title: 'Route & draft reply', desc: 'Assign queue, propose response', more: false },
    ],
  },
  kpi: {
    icon: ChartLine,
    name: 'Weekly KPI report',
    desc: 'Sheets → Slack digest',
    status: 'Paused',
    runs: '52 runs · 51 ok · 1 failed',
    runCount: '52',
    okCount: '51',
    failCount: '1',
    connections: [
      { icon: Table, name: 'Google Sheets', sub: 'Auth expired — tap to reconnect', tone: 'warn', status: 'Reconnect' },
      { icon: SlackLogo, name: 'Slack', sub: '#leadership · shared across workspace', tone: 'ok', status: 'Connected' },
    ],
    steps: [
      { id: 'kpi-trigger', icon: Timer, kicker: 'TRIGGER', title: 'Every Monday, 9:00 AM', desc: 'Schedule', more: true },
      { id: 'kpi-pull', icon: Table, kicker: 'ACTION', title: 'Pull metrics from Sheets', desc: 'Revenue, churn, pipeline tabs', more: true },
      { id: 'kpi-write', icon: Sparkle, kicker: 'AI STEP', title: 'Write the digest', desc: 'Summary with week-over-week deltas', more: true },
      { id: 'kpi-post', icon: SlackLogo, kicker: 'ACTION', title: 'Post to Slack', desc: '#leadership', more: false },
    ],
  },
  lead: {
    icon: UserPlus,
    name: 'Lead enrichment',
    desc: 'CRM enrich + score',
    status: 'Draft',
    runs: 'Not yet published',
    runCount: '—',
    okCount: '—',
    failCount: '—',
    connections: [
      { icon: PlugsConnected, name: 'HubSpot', sub: 'Required before publishing', tone: 'neutral', status: 'Not connected' },
    ],
    steps: [
      { id: 'lead-trigger', icon: Lightning, kicker: 'TRIGGER', title: 'New lead in CRM', desc: 'HubSpot · all pipelines', more: true },
      { id: 'lead-enrich', icon: Sparkle, kicker: 'AI STEP', title: 'Enrich company & contact', desc: 'Firmographics, role, intent', more: true },
      { id: 'lead-score', icon: Sparkle, kicker: 'AI STEP', title: 'Score the lead', desc: '0–100 with reasons', more: true },
      { id: 'lead-route', icon: PlugsConnected, kicker: 'ACTION', title: 'Route to owner', desc: 'Round-robin by territory', more: false },
    ],
  },
};

/** Builder canvas steps (design `steps`, unchanged). */
export const steps: PipelineStep[] = flowDefs.invoice.steps;

export const builderPalette: { icon: Icon; name: string }[] = [
  { icon: Lightning, name: 'Trigger' },
  { icon: Sparkle, name: 'AI step' },
  { icon: GitBranch, name: 'Branch' },
  { icon: PlugsConnected, name: 'Action' },
  { icon: HandPalm, name: 'Human review' },
  { icon: Timer, name: 'Delay' },
];

export type ActivityItem = {
  icon: Icon;
  tone: 'ok' | 'warn' | 'err';
  title: string;
  desc: string;
  time: string;
};

export const activityToday: ActivityItem[] = [
  { icon: CheckCircle, tone: 'ok', title: 'Invoice triage', desc: 'Run #4821 · posted to QuickBooks', time: '2m' },
  { icon: HandPalm, tone: 'warn', title: 'Invoice triage', desc: 'Run #4820 · held for review — amount mismatch', time: '12m' },
  { icon: CheckCircle, tone: 'ok', title: 'Email triage', desc: '32 emails routed · 3 escalated', time: '1h' },
  { icon: CheckCircle, tone: 'ok', title: 'Receipt OCR', desc: 'Run #911 · 4 receipts captured', time: '3h' },
];

export const activityYesterday: ActivityItem[] = [
  { icon: XCircle, tone: 'err', title: 'Weekly KPI report', desc: 'Run #52 · failed — Sheets auth expired', time: '9:12' },
  { icon: CheckCircle, tone: 'ok', title: 'Invoice triage', desc: '18 invoices processed · 1 exception', time: '8:30' },
  { icon: CheckCircle, tone: 'ok', title: 'Email triage', desc: '201 emails routed', time: '8:00' },
];

export type ApprovalItem = {
  workflow: string;
  title: string;
  why: string;
  time: string;
};

export const approvals: ApprovalItem[] = [
  { workflow: 'INVOICE TRIAGE', title: 'Invoice #4821 · Beacon Supply Co', why: 'Amount $12,480 differs from PO $11,900. Agent paused before posting.', time: '12m ago' },
  { workflow: 'REFUND FLOW', title: 'Refund $840 · Order 10293', why: 'Above the $500 auto-approve threshold.', time: '1h ago' },
  { workflow: 'VENDOR ONBOARDING', title: 'New vendor: Northwind Ltd', why: 'No W-9 on file — needs confirmation before setup.', time: '3h ago' },
];

export const approvalDoneText = {
  approved: 'Approved ✓ — agent resuming',
  rejected: 'Rejected — sent back to sender',
} as const;

export const templates: { icon: Icon; name: string; cat: string }[] = [
  { icon: EnvelopeSimple, name: 'Email triage', cat: 'Ops' },
  { icon: Receipt, name: 'Invoice capture', cat: 'Finance' },
  { icon: ChartLine, name: 'Weekly report digest', cat: 'Reporting' },
  { icon: UserPlus, name: 'Lead enrichment', cat: 'Sales' },
  { icon: Camera, name: 'Receipt OCR', cat: 'Finance' },
  { icon: BellRinging, name: 'Slack alerts', cat: 'Ops' },
];

export const templateFilters = ['All', 'Finance', 'Ops', 'Sales', 'Reporting'];

export const activityFilters = ['All', 'Success', 'Needs review', 'Failed'];

export const homeStats: { value: string; label: string; tone: 'text' | 'ok' | 'err' }[] = [
  { value: '128', label: 'Runs today', tone: 'text' },
  { value: '124', label: 'Successes', tone: 'ok' },
  { value: '4', label: 'Failures', tone: 'err' },
];

type RunItem = {
  name: string;
  meta: string;
  time: string;
  tone: 'ok' | 'warn';
  runVariant: RunVariant;
};

export const recentRuns: RunItem[] = [
  { name: 'Invoice triage', meta: '#4821 · posted to QuickBooks', time: '2m', tone: 'ok', runVariant: 'success' },
  { name: 'Invoice triage', meta: '#4820 · held for review', time: '12m', tone: 'warn', runVariant: 'held' },
  { name: 'Email triage', meta: '32 routed · 3 escalated', time: '1h', tone: 'ok', runVariant: 'success' },
  { name: 'Receipt OCR', meta: '#911 · 4 receipts captured', time: '3h', tone: 'ok', runVariant: 'success' },
];

/** Solutions marketplace (design: solDefs). Prices are monthly USD numbers so
 *  the plan total can be derived live; the Growth plan base is $99. */
export const PLAN_BASE_PRICE = 99;

export type SolutionDef = {
  icon: Icon;
  name: string;
  desc: string;
  cat: string;
  price: number;
};

export const solutionDefs: SolutionDef[] = [
  { icon: Receipt, name: 'Invoice triage', desc: 'AP inbox to ledger, exceptions held for you', cat: 'Finance', price: 39 },
  { icon: EnvelopeSimple, name: 'Email triage', desc: 'Route, draft and escalate support mail', cat: 'Ops', price: 29 },
  { icon: Camera, name: 'Receipt OCR', desc: 'Snap receipts into expense entries', cat: 'Finance', price: 19 },
  { icon: ChartLine, name: 'Weekly KPI digest', desc: 'Metrics to Slack every Monday morning', cat: 'Reporting', price: 19 },
  { icon: UserPlus, name: 'Lead enrichment', desc: 'Enrich, score and route new leads', cat: 'Sales', price: 49 },
  { icon: BellRinging, name: 'Slack alerts', desc: 'Threshold alerts from any data source', cat: 'Ops', price: 9 },
];

/** Design default: the first three solutions are on the plan (solOn 0,1,2). */
export const defaultActiveSolutions = [0, 1, 2];

export const solutionFilters = ['All', 'Finance', 'Ops', 'Sales', 'Reporting'];

/** Run detail variants (design `runDefs`: held / success / failed). */
export type RunVariant = 'held' | 'success' | 'failed' | 'retried';

export type RunTimelineItem = {
  icon: Icon;
  tone: 'ok' | 'warn' | 'err' | 'pending';
  title: string;
  sub: string;
  time?: string;
};

export type RunDetail = {
  title: string;
  sub: string;
  status: 'Held' | 'Success' | 'Failed';
  stats: { value: string; label: string }[];
  timeline: RunTimelineItem[];
  /** The extracted-fields card is omitted on failed runs (design runFields). */
  fields: boolean;
  /** Primary action; absent on successful runs (design runA1). */
  action?: { label: string; icon: Icon };
};

export const runDetails: Record<RunVariant, RunDetail> = {
  held: {
    title: 'Run #4820',
    sub: 'Invoice triage · today, 9:41 AM',
    status: 'Held',
    stats: [
      { value: '38s', label: 'Duration' },
      { value: '3 / 4', label: 'Steps done' },
      { value: '87%', label: 'Confidence' },
    ],
    timeline: [
      { icon: CheckCircle, tone: 'ok', title: 'New email received', sub: 'Gmail · ap@acme.co', time: '9:41:02' },
      { icon: CheckCircle, tone: 'ok', title: 'Fields extracted', sub: 'Vendor, amount, PO, due date', time: '9:41:19' },
      { icon: HandPalm, tone: 'warn', title: 'Held for review', sub: 'Amount differs from PO $11,900', time: '9:41:40' },
      { icon: CircleDashed, tone: 'pending', title: 'Post to QuickBooks', sub: 'Waiting on your approval' },
    ],
    fields: true,
    action: { label: 'Review & approve', icon: HandPalm },
  },
  success: {
    title: 'Run #4821',
    sub: 'Invoice triage · today, 9:52 AM',
    status: 'Success',
    stats: [
      { value: '42s', label: 'Duration' },
      { value: '4 / 4', label: 'Steps done' },
      { value: '98%', label: 'Confidence' },
    ],
    timeline: [
      { icon: CheckCircle, tone: 'ok', title: 'New email received', sub: 'Gmail · ap@acme.co', time: '9:52:01' },
      { icon: CheckCircle, tone: 'ok', title: 'Fields extracted', sub: 'Vendor, amount, PO, due date', time: '9:52:16' },
      { icon: CheckCircle, tone: 'ok', title: 'Classified & GL-coded', sub: '6200 · Office supplies', time: '9:52:28' },
      { icon: CheckCircle, tone: 'ok', title: 'Posted to QuickBooks', sub: 'Bill #10412 created, PDF attached', time: '9:52:43' },
    ],
    fields: true,
  },
  retried: {
    title: 'Run #52',
    sub: 'Weekly KPI report · retried just now',
    status: 'Success',
    stats: [
      { value: '26s', label: 'Duration' },
      { value: '4 / 4', label: 'Steps done' },
      { value: '—', label: 'Confidence' },
    ],
    timeline: [
      { icon: CheckCircle, tone: 'ok', title: 'Manual retry started', sub: 'By you · just now', time: 'now' },
      { icon: CheckCircle, tone: 'ok', title: 'Sheets reconnected & fetched', sub: 'Revenue, churn, pipeline tabs', time: '+8s' },
      { icon: CheckCircle, tone: 'ok', title: 'Digest built', sub: 'Week-over-week deltas included', time: '+19s' },
      { icon: CheckCircle, tone: 'ok', title: 'Posted to Slack', sub: '#leadership', time: '+26s' },
    ],
    fields: false,
  },
  failed: {
    title: 'Run #52',
    sub: 'Weekly KPI report · yesterday, 9:12 AM',
    status: 'Failed',
    stats: [
      { value: '12s', label: 'Duration' },
      { value: '1 / 4', label: 'Steps done' },
      { value: '—', label: 'Confidence' },
    ],
    timeline: [
      { icon: CheckCircle, tone: 'ok', title: 'Scheduled trigger fired', sub: 'Every Monday · 9:12 AM', time: '9:12:00' },
      { icon: XCircle, tone: 'err', title: 'Sheets connection failed', sub: 'Auth token revoked — reconnect Google Sheets', time: '9:12:12' },
      { icon: CircleDashed, tone: 'pending', title: 'Build digest', sub: 'Skipped' },
      { icon: CircleDashed, tone: 'pending', title: 'Post to Slack', sub: 'Skipped' },
    ],
    fields: false,
    action: { label: 'Retry run', icon: ArrowClockwise },
  },
};

/** Extracted fields shown for the invoice runs (design: identical card). */
export const runFields = [
  { key: 'Vendor', value: 'Beacon Supply Co' },
  { key: 'Amount', value: '$12,480.00' },
  { key: 'PO', value: '#8841' },
  { key: 'Due date', value: 'Sep 3, 2026' },
];

/** Settings CONNECTIONS card (design sSettings addition). */
export const settingsConnections: {
  icon: Icon;
  name: string;
  sub: string;
  connected: boolean;
}[] = [
  { icon: EnvelopeSimple, name: 'Gmail', sub: 'Connected · used by 2 solutions', connected: true },
  { icon: PlugsConnected, name: 'QuickBooks Online', sub: 'Connected · used by 1 solution', connected: true },
  { icon: SlackLogo, name: 'Slack', sub: 'Not connected', connected: false },
];

/** Notifications inbox (design `notifs`). `dot: true` = unread. */
export type NotificationItem = {
  icon: Icon;
  tone: 'ok' | 'warn' | 'err' | 'accent';
  unread: boolean;
  title: string;
  desc: string;
  time: string;
  /** Where the row navigates (design n.open). */
  target: 'run' | 'activity' | 'settings';
  runVariant?: RunVariant;
};

export const notifications: NotificationItem[] = [
  { icon: HandPalm, tone: 'warn', unread: true, title: 'Run held for review', desc: 'Invoice triage · amount differs from PO $11,900', time: '12m', target: 'run', runVariant: 'held' },
  { icon: XCircle, tone: 'err', unread: true, title: 'Run failed', desc: 'Weekly KPI report · Sheets auth expired', time: '1d', target: 'run', runVariant: 'failed' },
  { icon: CheckCircle, tone: 'ok', unread: false, title: 'Digest posted', desc: 'Weekly KPI report · #leadership', time: '1d', target: 'activity' },
  { icon: CheckCircle, tone: 'ok', unread: false, title: 'Bill created', desc: 'Invoice triage · QuickBooks bill #10398', time: '2d', target: 'activity' },
  { icon: CrownSimple, tone: 'accent', unread: false, title: 'Invoice paid', desc: 'Growth plan · $166 on Aug 1', time: '4d', target: 'settings' },
];

/** "New from template" configure screen (design sConfigure). */
export const templateConfigure = {
  icon: Receipt,
  name: 'Invoice capture',
  meta: 'Finance · 4 steps · used by 2,100 teams',
  defaultName: 'Invoice capture — AP',
  connection: { icon: PlugsConnected, name: 'QuickBooks Online' },
  steps: [
    { icon: EnvelopeOpen, title: 'New email in AP inbox', kicker: 'TRIGGER' },
    { icon: Sparkle, title: 'Extract invoice fields', kicker: 'AI STEP' },
    { icon: PlugsConnected, title: 'Post to QuickBooks', kicker: 'ACTION' },
  ],
  footnote: 'Steps land preloaded — edit anything before it goes live.',
};
