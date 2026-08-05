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

export const homeStats = [
  { value: '128', label: 'Runs today' },
  { value: '98.2%', label: 'Success' },
  { value: '6.4h', label: 'Time saved' },
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

export const onboardingPhases: OnboardingPhase[] = [
  { icon: Tray, kicker: 'THE MANUAL GRIND', title: 'Inboxes, invoices, intake forms. All day. Every day.', sub: "Document work eats whole teams. It doesn't have to." },
  { icon: Sparkle, kicker: 'AUTOMATION × AI', title: 'Every repetitive task, done by an agent.', sub: 'Extraction, classification, routing, posting. On their own.' },
  { icon: UsersThree, kicker: 'YOUR TEAM, UNBURDENED', title: 'Your team reviews. The agents run.', sub: 'Review points where judgment matters. Everything else just happens.' },
];
