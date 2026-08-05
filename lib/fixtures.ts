/**
 * Prototype fixture data, verbatim from the design's screen logic
 * (Screen.dc.html — DCLogic renderVals). The design is a clickable prototype
 * over this data; keep strings byte-identical to the design.
 */
import {
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
  { icon: Receipt, name: 'Invoice triage', desc: 'AP inbox → QuickBooks', status: 'Live', runs: '1,284 runs · 99.1% success' },
  { icon: EnvelopeSimple, name: 'Email triage', desc: 'Support inbox routing', status: 'Live', runs: '3,412 runs · 98.4% success' },
  { icon: ChartLine, name: 'Weekly KPI report', desc: 'Sheets → Slack digest', status: 'Paused', runs: '52 runs · 100% success' },
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
  { value: '124', label: 'Success', tone: 'ok' },
  { value: '4', label: 'Failed', tone: 'err' },
];

type RunItem = {
  name: string;
  meta: string;
  time: string;
  tone: 'ok' | 'warn';
};

export const recentRuns: RunItem[] = [
  { name: 'Invoice triage', meta: '#4821 · posted to QuickBooks', time: '2m', tone: 'ok' },
  { name: 'Invoice triage', meta: '#4820 · held for review', time: '12m', tone: 'warn' },
  { name: 'Email triage', meta: '32 routed · 3 escalated', time: '1h', tone: 'ok' },
  { name: 'Receipt OCR', meta: '#911 · 4 receipts captured', time: '3h', tone: 'ok' },
];

export const detailStats = [
  { value: '1,284', label: 'Runs' },
  { value: '99.1%', label: 'Success' },
  { value: '42s', label: 'Avg run' },
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

/** Run detail (design `sRun`: the held Invoice-triage run the prototype shows). */
export type RunTimelineItem = {
  icon: Icon;
  tone: 'ok' | 'warn' | 'pending';
  title: string;
  sub: string;
  time?: string;
};

export const runDetail = {
  title: 'Run #4820',
  sub: 'Invoice triage · today, 9:41 AM',
  status: 'Held' as const,
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
  ] satisfies RunTimelineItem[],
  fields: [
    { key: 'Vendor', value: 'Beacon Supply Co' },
    { key: 'Amount', value: '$12,480.00' },
    { key: 'PO', value: '#8841' },
    { key: 'Due date', value: 'Sep 3, 2026' },
  ],
};

export const onboardingPhases: OnboardingPhase[] = [
  { icon: Tray, kicker: 'THE MANUAL GRIND', title: 'Inboxes, invoices, intake forms. All day. Every day.', sub: "Document work eats whole teams. It doesn't have to." },
  { icon: Sparkle, kicker: 'AUTOMATION × AI', title: 'Every repetitive task, done by an agent.', sub: 'Extraction, classification, routing, posting. On their own.' },
  { icon: UsersThree, kicker: 'YOUR TEAM, UNBURDENED', title: 'Your team reviews. The agents run.', sub: 'Review points where judgment matters. Everything else just happens.' },
];
