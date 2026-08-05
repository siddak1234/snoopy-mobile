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
  EnvelopeOpen,
  EnvelopeSimple,
  GitBranch,
  HandPalm,
  Lightning,
  PlugsConnected,
  Receipt,
  SlackLogo,
  Sparkle,
  Timer,
  Tray,
  UserPlus,
  UsersThree,
  XCircle,
  type Icon,
} from 'phosphor-react-native';

export type FlowStatus = 'Live' | 'Paused' | 'Draft';

type Flow = {
  icon: Icon;
  name: string;
  desc: string;
  status: FlowStatus;
  runs: string;
};

export const flows: Flow[] = [
  { icon: Receipt, name: 'Invoice triage', desc: 'AP inbox → QuickBooks', status: 'Live', runs: '1,284 runs · 1,272 ok · 12 failed' },
  { icon: EnvelopeSimple, name: 'Email triage', desc: 'Support inbox routing', status: 'Live', runs: '3,412 runs · 3,357 ok · 55 failed' },
  { icon: ChartLine, name: 'Weekly KPI report', desc: 'Sheets → Slack digest', status: 'Paused', runs: '52 runs · 52 ok · 0 failed' },
  { icon: UserPlus, name: 'Lead enrichment', desc: 'CRM enrich + score', status: 'Draft', runs: 'Not yet published' },
];

export type PipelineStep = {
  icon: Icon;
  kicker: string;
  title: string;
  desc: string;
  more: boolean;
};

export const steps: PipelineStep[] = [
  { icon: EnvelopeOpen, kicker: 'TRIGGER', title: 'New email in AP inbox', desc: 'Gmail · ap@acme.co', more: true },
  { icon: Sparkle, kicker: 'AI STEP', title: 'Extract invoice fields', desc: 'Vendor, amount, PO, due date', more: true },
  { icon: GitBranch, kicker: 'AI STEP', title: 'Classify & GL-code', desc: 'Confidence < 95% → human review', more: true },
  { icon: PlugsConnected, kicker: 'ACTION', title: 'Post to QuickBooks', desc: 'Draft bill, attach PDF', more: false },
];

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

export const detailStats: { value: string; label: string; tone: 'text' | 'ok' | 'err' }[] = [
  { value: '1,284', label: 'Runs', tone: 'text' },
  { value: '1,272', label: 'Successes', tone: 'ok' },
  { value: '12', label: 'Failures', tone: 'err' },
];

type OnboardingPhase = {
  icon: Icon;
  kicker: string;
  title: string;
  sub: string;
};

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
export type RunVariant = 'held' | 'success' | 'failed';

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

/** Workflow detail CONNECTIONS card (design sDetail addition). */
export const detailConnections = [
  { icon: PlugsConnected, name: 'QuickBooks Online', sub: 'acme-books · linked via OAuth' },
  { icon: EnvelopeSimple, name: 'Gmail', sub: 'ap@acme.co · shared across workspace' },
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

export const onboardingPhases: OnboardingPhase[] = [
  { icon: Tray, kicker: 'THE MANUAL GRIND', title: 'Inboxes, invoices, intake forms. All day. Every day.', sub: "Document work eats whole teams. It doesn't have to." },
  { icon: Sparkle, kicker: 'AUTOMATION × AI', title: 'Every repetitive task, done by an agent.', sub: 'Extraction, classification, routing, posting. On their own.' },
  { icon: UsersThree, kicker: 'YOUR TEAM, UNBURDENED', title: 'Your team reviews. The agents run.', sub: 'Review points where judgment matters. Everything else just happens.' },
];
