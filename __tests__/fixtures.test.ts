import {
  activityFilters,
  activityToday,
  activityYesterday,
  approvalDoneText,
  approvals,
  builderPalette,
  detailStats,
  flows,
  homeStats,
  onboardingPhases,
  recentRuns,
  steps,
  templateFilters,
  templates,
} from '@/lib/fixtures';

describe('fixture data — byte-exact to the design prototype', () => {
  it('has the design cardinalities', () => {
    expect(flows).toHaveLength(4);
    expect(steps).toHaveLength(4);
    expect(builderPalette).toHaveLength(6);
    expect(activityToday).toHaveLength(4);
    expect(activityYesterday).toHaveLength(3);
    expect(approvals).toHaveLength(3);
    expect(templates).toHaveLength(6);
    expect(homeStats).toHaveLength(3);
    expect(recentRuns).toHaveLength(4);
    expect(detailStats).toHaveLength(3);
    expect(onboardingPhases).toHaveLength(3);
  });

  it('keeps typographic characters intact (·, →, —, ✓, …)', () => {
    expect(flows[0].desc).toBe('AP inbox → QuickBooks');
    expect(flows[0].runs).toBe('1,284 runs · 99.1% success');
    expect(activityToday[1].desc).toBe('Run #4820 · held for review — amount mismatch');
    expect(activityYesterday[0].desc).toBe('Run #52 · failed — Sheets auth expired');
    expect(approvalDoneText.approved).toBe('Approved ✓ — agent resuming');
    expect(approvalDoneText.rejected).toBe('Rejected — sent back to sender');
  });

  it('keeps the approval reasons verbatim', () => {
    expect(approvals[0].why).toBe(
      'Amount $12,480 differs from PO $11,900. Agent paused before posting.',
    );
    expect(approvals[1].why).toBe('Above the $500 auto-approve threshold.');
    expect(approvals[2].why).toBe('No W-9 on file — needs confirmation before setup.');
  });

  it('keeps the onboarding narrative verbatim', () => {
    expect(onboardingPhases.map((p) => p.kicker)).toEqual([
      'THE MANUAL GRIND',
      'AUTOMATION × AI',
      'YOUR TEAM, UNBURDENED',
    ]);
    expect(onboardingPhases[1].title).toBe('Every repetitive task, done by an agent.');
    expect(onboardingPhases[0].sub).toBe("Document work eats whole teams. It doesn't have to.");
  });

  it('keeps pipeline steps and their kinds', () => {
    expect(steps.map((s) => s.kicker)).toEqual(['TRIGGER', 'AI STEP', 'AI STEP', 'ACTION']);
    expect(steps[2].desc).toBe('Confidence < 95% → human review');
    expect(steps.map((s) => s.more)).toEqual([true, true, true, false]);
  });

  it('keeps filter chips in design order', () => {
    expect(activityFilters).toEqual(['All', 'Success', 'Needs review', 'Failed']);
    expect(templateFilters).toEqual(['All', 'Finance', 'Ops', 'Sales', 'Reporting']);
  });

  it('keeps flow statuses matching the pills map', () => {
    expect(flows.map((f) => f.status)).toEqual(['Live', 'Live', 'Paused', 'Draft']);
  });
});
