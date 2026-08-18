import {
  EMPTY,
  clockTime,
  count,
  duration,
  money,
  relativeTime,
  relativeTimeAgo,
} from '@/lib/view/format';
import { hasIcon, iconFor } from '@/lib/view/icon-registry';
import {
  isContinuation,
  runOriginLabel,
  statusLabel,
  statusTone,
} from '@/lib/view/status';

describe('statusLabel — the design pills, from the server vocabulary', () => {
  it('renders subscription statuses exactly as the design draws them', () => {
    expect(statusLabel('live')).toBe('Live');
    expect(statusLabel('paused')).toBe('Paused');
    expect(statusLabel('draft')).toBe('Draft');
  });

  it('renders `succeeded` as `Success` — the one label that is not a capitalisation', () => {
    expect(statusLabel('succeeded')).toBe('Success');
    expect(statusLabel('held')).toBe('Held');
    expect(statusLabel('failed')).toBe('Failed');
  });

  it('renders `pending` as `Queued`, the design\'s word for a run not yet started', () => {
    // Capitalising the server's word here would redefine the vocabulary rather
    // than map it, which is exactly what Gate 8 forbids.
    expect(statusLabel('pending')).toBe('Queued');
    expect(statusLabel('running')).toBe('Running');
    expect(statusLabel('cancelled')).toBe('Cancelled');
  });

  it('spaces hyphenated connection statuses', () => {
    expect(statusLabel('reauthorization-required')).toBe('Reauthorization required');
  });

  it('falls back to the empty mark rather than rendering nothing', () => {
    expect(statusLabel(null)).toBe(EMPTY);
    expect(statusLabel(undefined)).toBe(EMPTY);
  });
});

describe('statusTone', () => {
  it('maps each vocabulary onto the four treatments the design already draws', () => {
    expect(statusTone('live')).toBe('ok');
    expect(statusTone('succeeded')).toBe('ok');
    expect(statusTone('connected')).toBe('ok');
    expect(statusTone('approved')).toBe('ok');

    expect(statusTone('paused')).toBe('warn');
    expect(statusTone('held')).toBe('warn');
    expect(statusTone('reauthorization-required')).toBe('warn');

    expect(statusTone('failed')).toBe('err');
    expect(statusTone('rejected')).toBe('err');

    expect(statusTone('draft')).toBe('neutral');
    expect(statusTone('cancelled')).toBe('neutral');
    expect(statusTone('expired')).toBe('neutral');
    expect(statusTone('pending')).toBe('neutral');
  });

  it('gives `running` the accent — the one run state a person watches', () => {
    expect(statusTone('running')).toBe('accent');
  });

  it('is case-insensitive, so the design `Live` and the server `live` agree', () => {
    expect(statusTone('Live')).toBe(statusTone('live'));
    expect(statusTone('  HELD  ')).toBe('warn');
  });

  it('renders an unknown status neutral instead of throwing', () => {
    // The server owns these vocabularies and may add to one first.
    expect(statusTone('some-future-state')).toBe('neutral');
    expect(statusTone(null)).toBe('neutral');
  });
});

describe('run origin — not a status', () => {
  it('describes `retried` as an origin, which is what the platform calls it', () => {
    // The prototype's RunVariant included 'retried' alongside held/success/
    // failed. It is `origin: retry-continuation`; conflating the two is the
    // redefinition Gate 8 forbids.
    expect(runOriginLabel('retry-continuation')).toBe('Retried');
    expect(statusTone('retried')).toBe('neutral');
  });

  it('labels the other origins', () => {
    expect(runOriginLabel('trigger')).toBe('Triggered');
    expect(runOriginLabel('manual')).toBe('Run manually');
    expect(runOriginLabel('approval-continuation')).toBe('Continued after approval');
  });

  it('knows which origins continue an earlier run', () => {
    expect(isContinuation('retry-continuation')).toBe(true);
    expect(isContinuation('approval-continuation')).toBe(true);
    expect(isContinuation('trigger')).toBe(false);
    expect(isContinuation('manual')).toBe(false);
  });
});

describe('count', () => {
  it('groups thousands the way the design does', () => {
    expect(count(1284)).toBe('1,284');
    expect(count(3412)).toBe('3,412');
    expect(count(52)).toBe('52');
    expect(count(0)).toBe('0');
  });

  it('renders the empty mark for a workflow that has never run', () => {
    expect(count(null)).toBe('—');
    expect(count(undefined)).toBe('—');
  });
});

describe('money', () => {
  it('renders whole dollars, as every price in the design is', () => {
    expect(money(39)).toBe('$39');
    expect(money(99)).toBe('$99');
    expect(money(186)).toBe('$186');
    expect(money(1299)).toBe('$1,299');
  });

  it('renders the empty mark when there is no price', () => {
    expect(money(null)).toBe('—');
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-08-16T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('uses the design’s compact form', () => {
    expect(relativeTime(ago(2 * 60_000), now)).toBe('2m');
    expect(relativeTime(ago(12 * 60_000), now)).toBe('12m');
    expect(relativeTime(ago(60 * 60_000), now)).toBe('1h');
    expect(relativeTime(ago(3 * 60 * 60_000), now)).toBe('3h');
    expect(relativeTime(ago(4 * 24 * 60 * 60_000), now)).toBe('4d');
  });

  it('collapses the last minute to `now` and never goes negative', () => {
    expect(relativeTime(ago(5_000), now)).toBe('now');
    expect(relativeTime(new Date(now + 60_000).toISOString(), now)).toBe('now');
  });

  it('adds the suffix the approvals screen uses', () => {
    expect(relativeTimeAgo(ago(12 * 60_000), now)).toBe('12m ago');
    expect(relativeTimeAgo(ago(5_000), now)).toBe('just now');
  });

  it('renders the empty mark for missing or unparseable instants', () => {
    expect(relativeTime(null, now)).toBe('—');
    expect(relativeTime('not-a-date', now)).toBe('—');
    expect(relativeTimeAgo(null, now)).toBe('—');
  });
});

describe('clockTime', () => {
  it('renders H:MM with a padded minute', () => {
    const at = new Date(2026, 7, 16, 8, 0).toISOString();
    expect(clockTime(at)).toBe('8:00');
    expect(clockTime(new Date(2026, 7, 16, 9, 12).toISOString())).toBe('9:12');
  });

  it('renders the empty mark when absent', () => {
    expect(clockTime(undefined)).toBe('—');
  });
});

describe('duration', () => {
  const start = '2026-08-16T12:00:00Z';
  const plus = (ms: number) => new Date(Date.parse(start) + ms).toISOString();

  it('renders the run-detail stat card’s form', () => {
    expect(duration(start, plus(38_000))).toBe('38s');
    expect(duration(start, plus(2 * 60_000))).toBe('2m');
    expect(duration(start, plus(90 * 60_000))).toBe('1h');
  });

  it('renders the empty mark for a run that has not finished', () => {
    expect(duration(start, null)).toBe('—');
    expect(duration(null, plus(1000))).toBe('—');
    expect(duration(plus(1000), start)).toBe('—');
  });
});

describe('iconFor', () => {
  it('resolves the icon names the design draws', () => {
    // The catalog example in BUILD-PLAN §1 sends `"icon": "Receipt"`.
    expect(iconFor('Receipt')).toBeDefined();
    expect(hasIcon('Receipt')).toBe(true);
    expect(hasIcon('ChartLine')).toBe(true);
  });

  it('falls back rather than throwing on a name this build has not heard of', () => {
    // Manifests are backend-owned data; a new one must render, not crash.
    expect(hasIcon('SomeIconShippedLater')).toBe(false);
    expect(iconFor('SomeIconShippedLater')).toBeDefined();
    expect(iconFor(null)).toBeDefined();
    expect(iconFor('')).toBeDefined();
  });
});
