import {
  activityFilters,
  activityToday,
  activityYesterday,
  approvalDoneText,
  approvals,
  builderPalette,
  defaultActiveSolutions,
  flowDefs,
  flowKeys,
  homeStats,
  onboardingPhases,
  PLAN_BASE_PRICE,
  notifications,
  recentRuns,
  runDetails,
  runFields,
  solutionDefs,
  solutionFilters,
  steps,
  templateConfigure,
  templateFilters,
  templates,
} from '@/lib/fixtures';

describe('fixture data — byte-exact to the design prototype', () => {
  it('has the design cardinalities', () => {
    expect(flowKeys).toHaveLength(4);
    expect(steps).toHaveLength(4);
    expect(builderPalette).toHaveLength(6);
    expect(activityToday).toHaveLength(4);
    expect(activityYesterday).toHaveLength(3);
    expect(approvals).toHaveLength(3);
    expect(templates).toHaveLength(6);
    expect(homeStats).toHaveLength(3);
    expect(recentRuns).toHaveLength(4);
    expect(onboardingPhases).toHaveLength(3);
  });

  it('keeps typographic characters intact (·, →, —, ✓, …)', () => {
    expect(flowDefs.invoice.desc).toBe('AP inbox → QuickBooks');
    expect(flowDefs.invoice.runs).toBe('1,284 runs · 1,272 ok · 12 failed');
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
    expect(steps.map((st) => st.kicker)).toEqual(['TRIGGER', 'AI STEP', 'AI STEP', 'ACTION']);
    expect(steps[2].desc).toBe('Low confidence → human review');
    expect(steps.map((st) => st.more)).toEqual([true, true, true, false]);
  });

  it('keeps filter chips in design order', () => {
    expect(activityFilters).toEqual(['All', 'Success', 'Needs review', 'Failed']);
    expect(templateFilters).toEqual(['All', 'Finance', 'Ops', 'Sales', 'Reporting']);
  });

  it('keeps flow statuses matching the pills map', () => {
    expect(flowKeys.map((k) => flowDefs[k].status)).toEqual(['Live', 'Live', 'Paused', 'Draft']);
  });

  it('keeps the solutions marketplace pricing (design solDefs)', () => {
    expect(solutionDefs.map((sd) => sd.price)).toEqual([39, 29, 19, 19, 49, 9]);
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

  it('keeps the updated run-count strings and per-flow stats', () => {
    expect(flowDefs.invoice.runs).toBe('1,284 runs · 1,272 ok · 12 failed');
    expect(flowDefs.kpi.runs).toBe('52 runs · 51 ok · 1 failed');
    expect(homeStats.map((hs) => hs.label)).toEqual(['Runs today', 'Successes', 'Failures']);
    expect(recentRuns.map((r) => r.runVariant)).toEqual(['success', 'held', 'success', 'success']);
  });

  it('carries per-workflow connections, steps and counts (design flowDefs)', () => {
    expect(flowKeys).toEqual(['invoice', 'email', 'kpi', 'lead']);
    expect(flowDefs.email.steps.map((st) => st.kicker)).toEqual([
      'TRIGGER',
      'AI STEP',
      'BRANCH',
      'ACTION',
    ]);
    expect(flowDefs.kpi.connections[0]).toMatchObject({
      name: 'Google Sheets',
      sub: 'Auth expired — tap to reconnect',
      tone: 'warn',
      status: 'Reconnect',
    });
    expect(flowDefs.lead.runCount).toBe('—');
    expect(flowDefs.lead.connections[0].name).toBe('HubSpot');
    expect(flowDefs.invoice.steps[2].desc).toBe('Low confidence → human review');
  });

  it('carries the retried run variant, notifications and configure copy (v4)', () => {
    expect(runDetails.retried.title).toBe('Run #52');
    expect(runDetails.retried.status).toBe('Success');
    expect(runDetails.retried.sub).toBe('Weekly KPI report · retried just now');
    expect(runDetails.retried.timeline.map((t) => t.title)).toEqual([
      'Manual retry started',
      'Sheets reconnected & fetched',
      'Digest built',
      'Posted to Slack',
    ]);
    expect(runDetails.retried.fields).toBe(false);

    expect(notifications).toHaveLength(5);
    expect(notifications.filter((n) => n.unread)).toHaveLength(2);
    expect(notifications[0].desc).toBe('Invoice triage · amount differs from PO $11,900');

    expect(templateConfigure.defaultName).toBe('Invoice capture — AP');
    expect(templateConfigure.meta).toBe('Finance · 4 steps · used by 2,100 teams');
    expect(templateConfigure.footnote).toBe(
      'Steps land preloaded — edit anything before it goes live.',
    );
  });
});
