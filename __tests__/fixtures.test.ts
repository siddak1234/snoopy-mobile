import {
  activityFilters,
  activityToday,
  activityYesterday,
  approvalDoneText,
  approvals,
  builderPalette,
  defaultActiveSolutions,
  detailStats,
  flows,
  homeStats,
  onboardingPhases,
  PLAN_BASE_PRICE,
  recentRuns,
  runDetails,
  runFields,
  solutionDefs,
  solutionFilters,
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
    expect(flows[0].runs).toBe('1,284 runs · 1,272 ok · 12 failed');
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

  it('keeps the solutions marketplace pricing (design solDefs)', () => {
    expect(solutionDefs.map((s) => s.price)).toEqual([39, 29, 19, 19, 49, 9]);
    expect(defaultActiveSolutions).toEqual([0, 1, 2]);
    expect(PLAN_BASE_PRICE).toBe(99);
    expect(solutionFilters).toEqual(['All', 'Finance', 'Ops', 'Sales', 'Reporting']);
    expect(solutionDefs[0].desc).toBe('AP inbox to ledger, exceptions held for you');
  });

  it('keeps the three run-detail variants verbatim (design runDefs)', () => {
    expect(runDetails.held.title).toBe('Run #4820');
    expect(runDetails.held.status).toBe('Held');
    expect(runDetails.held.timeline.map((t) => t.tone)).toEqual(['ok', 'ok', 'warn', 'pending']);
    expect(runDetails.held.action?.label).toBe('Review & approve');

    expect(runDetails.success.title).toBe('Run #4821');
    expect(runDetails.success.sub).toBe('Invoice triage · today, 9:52 AM');
    expect(runDetails.success.timeline[3].sub).toBe('Bill #10412 created, PDF attached');
    expect(runDetails.success.action).toBeUndefined();

    expect(runDetails.failed.title).toBe('Run #52');
    expect(runDetails.failed.fields).toBe(false);
    expect(runDetails.failed.timeline[1].sub).toBe(
      'Auth token revoked — reconnect Google Sheets',
    );
    expect(runDetails.failed.action?.label).toBe('Retry run');

    expect(runFields.map((f) => f.value)).toEqual([
      'Beacon Supply Co',
      '$12,480.00',
      '#8841',
      'Sep 3, 2026',
    ]);
  });

  it('keeps the updated run-count strings and colored stats', () => {
    expect(flows[0].runs).toBe('1,284 runs · 1,272 ok · 12 failed');
    expect(homeStats.map((s) => s.label)).toEqual(['Runs today', 'Successes', 'Failures']);
    expect(detailStats.map((s) => s.tone)).toEqual(['text', 'ok', 'err']);
    expect(recentRuns.map((r) => r.runVariant)).toEqual(['success', 'held', 'success', 'success']);
  });
});
