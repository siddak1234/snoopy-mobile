/**
 * The server's status vocabularies, mapped to the design's pill vocabulary.
 *
 * Gate 8 requires the mobile vocabulary be *mapped rather than redefined*, and
 * that is a real constraint rather than a stylistic one. The design pills read
 * `Live`, `Paused`, `Draft`, `Held`, `Success`, `Failed`; the platform sends
 * `live`, `paused`, `draft`, `held`, `succeeded`, `failed`. Only one pair
 * differs by more than case — `succeeded` renders `Success` — so that pair is
 * the reason this file exists rather than a `toUpperCase` call at each site.
 *
 * The tone table is ported from `snoopy/components/dashboard/StatusPill.tsx`,
 * whose own docstring notes that lowercasing on lookup is what lets "the mobile
 * client's `Live` and the server's `live` be the same thing". Unknown values
 * render neutral rather than throwing, because the server owns these
 * vocabularies and may add to one before this file hears about it.
 *
 * `RunOrigin` is deliberately absent from the status table. The prototype's
 * `RunVariant` included `retried`, which is not a status at all — it is
 * `origin: 'retry-continuation'`. Conflating the two is exactly the redefinition
 * the gate forbids, so origin is described by `runOriginLabel` instead.
 */

/** The four pill treatments the Nocturne design already draws. */
export type StatusTone = 'ok' | 'warn' | 'err' | 'neutral';

/**
 * A workflow's status, in the design's words.
 *
 * The platform's `SubscriptionStatus` is the same three states lowercased —
 * `packages/contracts/src/index.ts` annotates it "Mirrors the reference UI's
 * FlowStatus". `statusLabel` is the conversion.
 */
export type FlowStatus = 'Live' | 'Paused' | 'Draft';

/**
 * Every word the design's status pill renders.
 *
 * Workflow states plus the three run outcomes it draws. Note `Success`, not
 * `Succeeded`: the pill keeps the design's word and `statusLabel` maps the
 * server's onto it.
 */
export type StatusPillLabel = FlowStatus | 'Held' | 'Success' | 'Failed';

const STATUS_TONE: Record<string, StatusTone> = {
  // Subscription — what the design calls a workflow's status.
  live: 'ok',
  paused: 'warn',
  draft: 'neutral',

  // Run.
  succeeded: 'ok',
  failed: 'err',
  held: 'warn',
  // `pending` and `running` never appeared in the prototype, which only drew
  // terminal and held runs. They take the neutral treatment rather than a new
  // colour: introducing a fifth pill appearance is a design decision, and the
  // UI is frozen. Recorded for the design session as an open question.
  pending: 'neutral',
  running: 'neutral',
  cancelled: 'neutral',

  // Approval.
  approved: 'ok',
  rejected: 'err',
  expired: 'neutral',

  // Connection. These four are what `connections.yaml` publishes; note that
  // `packages/contracts` declares a wider set (`not-connected`, `error`,
  // `disconnecting`) that the spec does not. The extra three are intentionally
  // absent here — they fall through to neutral — and the divergence is filed as
  // a finding for the backend rather than guessed at.
  authorizing: 'neutral',
  connected: 'ok',
  'reauthorization-required': 'warn',
  disconnected: 'neutral',
};

/**
 * Display casing, byte-identical to the design's pills.
 *
 * `succeeded` is the one value whose label is not its status capitalised; every
 * other word matches once hyphens become spaces.
 */
const DISPLAY_OVERRIDES: Record<string, string> = {
  succeeded: 'Success',
};

export function statusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'neutral';
  return STATUS_TONE[status.toLowerCase().trim()] ?? 'neutral';
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  const key = status.toLowerCase().trim();
  const override = DISPLAY_OVERRIDES[key];
  if (override) return override;
  const spaced = key.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Why a run exists, in the design's words.
 *
 * The prototype showed a "retried" run; the platform expresses that as a
 * continuation whose origin is `retry-continuation`, linked to its parent by
 * `rootRunId`. A run is a retry because of where it came from, not what state
 * it is in.
 */
export function runOriginLabel(origin: string | null | undefined): string {
  if (!origin) return '—';
  switch (origin.toLowerCase().trim()) {
    case 'trigger':
      return 'Triggered';
    case 'manual':
      return 'Run manually';
    case 'approval-continuation':
      return 'Continued after approval';
    case 'retry-continuation':
      return 'Retried';
    default:
      return statusLabel(origin);
  }
}

/** True when a run continues an earlier one, so the UI can group by `rootRunId`. */
export function isContinuation(origin: string | null | undefined): boolean {
  const key = origin?.toLowerCase().trim();
  return key === 'approval-continuation' || key === 'retry-continuation';
}
