import type { CatalogEntry } from '@/lib/platform/catalog';
import { toSolution, toTemplate } from '@/lib/view/catalog';
import { statusTone } from '@/lib/view/status';

/**
 * Two published fields the client used to drop, and the vocabulary it used to
 * redefine. Every case here fails against the previous mapping.
 *
 * Gate 8 asks that both clients drive the same journey against the same
 * endpoints, "with the mobile status vocabulary mapped rather than redefined".
 * Dropping a required field is one way to break that and collapsing a status
 * enum into a smaller one is the other, so both are pinned here rather than
 * left to review.
 */

function entry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    templateId: 'tpl.invoice',
    version: 3,
    name: 'Invoice triage',
    description: 'Reads invoices and posts them.',
    category: 'Finance',
    icon: 'receipt',
    monthlyPriceUsd: 49,
    subscribed: false,
    available: true,
    setup: [],
    ...overrides,
  } as CatalogEntry;
}

describe('AutomationCatalogEntry.available survives the mapping', () => {
  it('is carried onto a marketplace card', () => {
    expect(toSolution(entry({ available: false })).available).toBe(false);
    expect(toSolution(entry({ available: true })).available).toBe(true);
  });

  it('is carried onto a template card', () => {
    expect(toTemplate(entry({ available: false })).available).toBe(false);
    expect(toTemplate(entry({ available: true })).available).toBe(true);
  });

  it('is never inferred from any other field', () => {
    // A subscribed automation can still stop answering, and a free one is not
    // more reachable than a paid one. `available` is probe evidence and has no
    // relationship to either, so nothing may stand in for it.
    expect(toSolution(entry({ available: false, subscribed: true })).available).toBe(false);
    expect(toSolution(entry({ available: false, monthlyPriceUsd: 0 })).available).toBe(false);
  });
});

describe('run status tones are not collapsed', () => {
  /**
   * The Activity screen used to narrow five tones into three by mapping both
   * `accent` and `neutral` onto `warn`. `warn` is the "Needs review" chip, so a
   * running, queued or cancelled run was listed as awaiting a human decision.
   */
  it('gives held, running, queued and cancelled four distinguishable treatments', () => {
    expect(statusTone('held')).toBe('warn');
    expect(statusTone('running')).toBe('accent');
    expect(statusTone('pending')).toBe('neutral');
    expect(statusTone('cancelled')).toBe('neutral');

    // The one that matters: nothing else may wear held's treatment, because
    // that treatment is what the review queue is selected by.
    for (const status of ['running', 'pending', 'cancelled', 'succeeded', 'failed']) {
      expect(statusTone(status)).not.toBe(statusTone('held'));
    }
  });

  it('keeps succeeded and failed on their own tones', () => {
    expect(statusTone('succeeded')).toBe('ok');
    expect(statusTone('failed')).toBe('err');
  });
});
