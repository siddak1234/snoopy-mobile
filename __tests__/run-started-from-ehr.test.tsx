import { screen, within } from '@testing-library/react-native';
import React from 'react';

import ActivityScreen from '@/app/(tabs)/activity/index';
import RunScreen from '@/app/(tabs)/activity/run';
import RunDetailsScreen from '@/app/(tabs)/activity/run-details';
import type { Run } from '@/lib/platform/runs';
import { catalogIndex, startedFromEhr, toRunFacts, toRunRow } from '@/lib/view/runs';
import { fakePlatform } from '@/test/fake-platform';
import { catalogPayload, flowCatalogPayload, routePlatform, runDetailPayload, runsPayload, signedInSession } from '@/test/platform';
import { renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn((prefix: string) => `${prefix}-key`),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * Round 22 (backend ADR-0053): a run carries `startedBy`, which of its flow's
 * ways to start started it. One a clinic's EHR started (`provider-event`, a
 * CDS Hooks call) says so in plain words — "Started from your EHR", the
 * session's — on its Activity row and as its run page's own line over the
 * body, as the website's; Run details' Trigger keeps its origin's words, so a
 * follow-on run is still "After approval" (the session's parity decision D5).
 * Every other way, and a run made before the platform kept it, says what it
 * said.
 */

const at = new Date(2026, 10, 25, 9, 5).toISOString();
const base: Run = { ...runsPayload().runs[0]!, id: 'run-ehr', createdAt: at, updatedAt: at, origin: 'trigger' };

beforeEach(() => {
  platformOperation.mockReset();
});

describe('a run its EHR started', () => {
  it('says "Started from your EHR" on its Activity row, between when and the run', async () => {
    routePlatform(platformOperation, {
      '/automations': flowCatalogPayload(),
      '/runs': { runs: [{ ...base, startedBy: 'provider-event' }, { ...base, id: 'run-manual', startedBy: 'manual' }] },
      '/approvals': { approvals: [] },
    });
    await renderWithProviders(<ActivityScreen />, signedInSession);
    const row = within(await screen.findByTestId('activity-row-run-ehr'));
    expect(row.getByText('Nov 25, 2026, 9:05 AM · Started from your EHR · Run run-ehr')).toBeTruthy();
    const manual = within(screen.getByTestId('activity-row-run-manual'));
    expect(manual.getByText('Nov 25, 2026, 9:05 AM · Run run-manual')).toBeTruthy();
    expect(manual.queryByText(/EHR/u)).toBeNull();
  });

  /** One run's reads, the run as given. */
  function routeRun(run: Partial<Run>) {
    const fake = fakePlatform(platformOperation);
    const detail = runDetailPayload('run-0');
    fake.always('GET /v1/workspaces/{workspaceId}/automations', catalogPayload());
    fake.always('GET /v1/workspaces/{workspaceId}/approvals', { approvals: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/runs/{runId}', { ...detail, run: { ...detail.run, ...run } });
    setMockParams({ runId: 'run-0' });
  }

  it("keeps its origin's words as its Trigger on Run details — a follow-on run is still \"After approval\" — and says the EHR nowhere there", async () => {
    routeRun({ startedBy: 'provider-event', origin: 'approval-continuation' });
    await renderWithProviders(<RunDetailsScreen />, signedInSession);
    const trigger = within(await screen.findByTestId('run-fact-Trigger'));
    expect(trigger.getByText('After approval')).toBeTruthy();
    expect(screen.queryByText('Started from your EHR')).toBeNull();
  });

  it('says it on its run page, its own line over the body', async () => {
    routeRun({ startedBy: 'provider-event', origin: 'approval-continuation' });
    await renderWithProviders(<RunScreen />, signedInSession);
    expect((await screen.findByTestId('run-started-by')).props.children).toBe('Started from your EHR');
    expect(screen.getAllByText('Started from your EHR')).toHaveLength(1);
  });

  it('a run any other way started has no such line on its page', async () => {
    routeRun({ startedBy: 'manual' });
    await renderWithProviders(<RunScreen />, signedInSession);
    await screen.findByTestId('run-blocks');
    expect(screen.queryByTestId('run-started-by')).toBeNull();
    expect(screen.queryByText('Started from your EHR')).toBeNull();
  });

  it.each([
    ['a person', 'manual' as const, 'Triggered'],
    ['a schedule', 'schedule' as const, 'Triggered'],
    ['a webhook', 'webhook' as const, 'Triggered'],
    ['a run made before the platform kept it', undefined, 'Triggered'],
  ])('started by %s, nothing new: its row and its Trigger as before', (_case, startedBy, trigger) => {
    const run: Run = { ...base, ...(startedBy ? { startedBy } : {}) };
    expect(startedFromEhr(run)).toBe(false);
    expect(toRunRow(run, catalogIndex([])).stamp).toBe('Nov 25, 2026, 9:05 AM · Run run-ehr');
    expect(toRunFacts(run).find((fact) => fact.label === 'Trigger')?.value).toBe(trigger);
  });

  it("its EHR's start leaves Trigger its origin's: Triggered, or After approval", () => {
    expect(toRunFacts({ ...base, startedBy: 'provider-event' }).find((fact) => fact.label === 'Trigger')?.value).toBe('Triggered');
    expect(
      toRunFacts({ ...base, startedBy: 'provider-event', origin: 'approval-continuation' }).find((fact) => fact.label === 'Trigger')?.value,
    ).toBe('After approval');
  });
});
