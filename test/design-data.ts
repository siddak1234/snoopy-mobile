/**
 * Design-prototype data, owned by the test tree.
 *
 * These arrays are byte-identical to the design's own screen logic
 * (`design-source/.../Screen.dc.html`, DCLogic renderVals), and that is exactly
 * why the suites want them: a payload shaped from this data proves the wire→view
 * mapping renders the design's own strings.
 *
 * It lives under `test/` rather than `lib/` because that is what it is. While it
 * sat in `lib/fixtures.ts` the "zero runtime fixture imports" gate was satisfied
 * by a script exemption naming that path; from here the rule holds by
 * construction — there is no prototype data inside the runtime roots to import.
 * Round 6 wired every screen to the platform, so nothing but a test reads this.
 *
 * Trimmed to the eight symbols the suites actually use. The other eleven exports
 * had exactly one consumer, `__tests__/fixtures.test.ts`, which existed only to
 * assert this data against itself; the Nocturne snapshots pin the rendered
 * design, which is the check that was doing real work.
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

export const templates: { icon: Icon; name: string; cat: string }[] = [
  { icon: EnvelopeSimple, name: 'Email triage', cat: 'Ops' },
  { icon: Receipt, name: 'Invoice capture', cat: 'Finance' },
  { icon: ChartLine, name: 'Weekly report digest', cat: 'Reporting' },
  { icon: UserPlus, name: 'Lead enrichment', cat: 'Sales' },
  { icon: Camera, name: 'Receipt OCR', cat: 'Finance' },
  { icon: BellRinging, name: 'Slack alerts', cat: 'Ops' },
];

/** Solutions marketplace (design: solDefs). Prices are monthly USD numbers so
 *  the plan total can be derived live; the Growth plan base is $99. */
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
