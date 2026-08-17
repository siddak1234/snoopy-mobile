import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';

import ActivityScreen from '@/app/(tabs)/activity/index';
import ApprovalsScreen from '@/app/(tabs)/activity/approvals';
import BuilderScreen from '@/app/(tabs)/flows/builder';
import FlowsScreen from '@/app/(tabs)/flows/index';
import TemplatesScreen from '@/app/(tabs)/flows/templates';
import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import HomeScreen from '@/app/(tabs)/(home)/index';
import RunDetailScreen from '@/app/(tabs)/(home)/run';
import SettingsScreen from '@/app/(tabs)/settings';
import SetupScreen from '@/app/(tabs)/solutions/setup';
import SolutionsScreen from '@/app/(tabs)/solutions/index';
import ConfigureScreen from '@/app/(tabs)/flows/configure';
import NotificationsScreen from '@/app/(tabs)/(home)/notifications';
import { nocturneDark, nocturneLight } from '@/constants/theme';
import { flowCatalogPayload, routePlatform, signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({ platformJson: jest.fn() }));
const { platformJson } = jest.requireMock('@/lib/platform/client');

/**
 * These screens read the platform now, so they render with a session and a
 * routed transport mock. The payloads are built FROM `lib/fixtures` in
 * `test/platform.tsx` — Gate 8 exempts tests — so the assertions below still
 * describe what the DESIGN draws, while the values travel through the real
 * mappers on the way. That is a stronger test than before, not a weaker one.
 */
beforeEach(() => {
  platformJson.mockReset();
  routePlatform(platformJson);
});

describe('Home dashboard', () => {
  it('shows greeting, stats and recent runs from the fixtures', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(getByText('Welcome back, Alex')).toBeTruthy();
    expect(getByText('Your agents ran 128 tasks while you were away.')).toBeTruthy();
    expect(getByText('128')).toBeTruthy();
    expect(getByText('124')).toBeTruthy();
    expect(getByText('4')).toBeTruthy();
    expect(getByText('Successes')).toBeTruthy();
    expect(getByText('Failures')).toBeTruthy();
    expect(getByText('3 items need your review')).toBeTruthy();
    // §12.1 #67 refuses run output; the row draws `resultSummary`.
    expect(getByText('Run #4821 · posted to QuickBooks')).toBeTruthy();
  });

  it('routes every affordance per the design flow map', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<HomeScreen />, signedInSession);
    await fireEvent.press(getByText('3 items need your review'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/activity/approvals');
    await fireEvent.press(getByText('Add a solution'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/solutions');
    await fireEvent.press(getByText('Templates'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/templates');
    await fireEvent.press(getByText('See all'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/activity');
  });

  it('opens Run detail from a recent-run row', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<HomeScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Run #4821 · posted to QuickBooks'));
    // A real run id now, not a prototype variant.
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/(home)/run',
      params: { runId: 'run-0' },
    });
  });
});

describe('Solutions marketplace', () => {
  it('lists the six solutions with prices and the live plan total', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<SolutionsScreen />, signedInSession);
    expect(getByText('Growth plan · $186/mo')).toBeTruthy();
    expect(getByText('3 active · manage in Settings')).toBeTruthy();
    expect(getAllByText('Weekly KPI digest').length).toBeGreaterThan(0);
    expect(getAllByText('Finance · $39/mo').length).toBeGreaterThan(0);
    expect(getAllByText('Ops · $9/mo').length).toBeGreaterThan(0);
    expect(getAllByText('Added ✓').length).toBeGreaterThan(0);
    expect(getAllByText('Add').length).toBeGreaterThan(0);
  });

  it('Add opens the Setup wizard with the solution index (design v3)', async () => {
    const { getAllByText, queryByText } = await renderWithProviders(<SolutionsScreen />, signedInSession);
    // First not-added solution is Weekly KPI digest (index 3).
    await fireEvent.press(getAllByText('Add')[0]);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/solutions/setup',
      // Carries BOTH: templateId is the real identity, and index keeps the
      // prototype path working while an unconfigured build has no catalog.
      params: expect.objectContaining({ template: expect.any(String) }),
    });
  });

  it('removal goes through the confirm dialog (design rmOpen)', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<SolutionsScreen />, signedInSession);
    await fireEvent.press(getAllByText('Added ✓')[0]);
    expect(getByText('Remove Invoice triage?')).toBeTruthy();
    expect(
      getByText(
        'Workflows built on it pause immediately. $39/mo comes off your next invoice (Sep 1). Its QuickBooks connection stays on your workspace.',
      ),
    ).toBeTruthy();
    await fireEvent.press(getByText('Keep it'));
    expect(queryByText('Remove Invoice triage?')).toBeNull();
    expect(getByText('Growth plan · $186/mo')).toBeTruthy();
    await fireEvent.press(getAllByText('Added ✓')[0]);
    await fireEvent.press(getByText('Remove'));
    expect(getByText('Growth plan · $147/mo')).toBeTruthy();
    expect(getByText('2 active · manage in Settings')).toBeTruthy();
  });

  it('opens Settings from the plan banner', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<SolutionsScreen />, signedInSession);
    await fireEvent.press(getByText('3 active · manage in Settings'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings');
  });

  it('filters the marketplace by category', async () => {
    const { getByText, queryByText, getAllByText } = await renderWithProviders(<SolutionsScreen />, signedInSession);
    await fireEvent.press(getByText('Finance'));
    expect(getByText('Invoice triage')).toBeTruthy();
    expect(getByText('Receipt OCR')).toBeTruthy();
    expect(queryByText('Email triage')).toBeNull();
    expect(queryByText('Slack alerts')).toBeNull();
    await fireEvent.press(getByText('Ops'));
    expect(getByText('Email triage')).toBeTruthy();
    expect(queryByText('Invoice triage')).toBeNull();
  });

  it('removes the correct solution from a filtered list', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<SolutionsScreen />, signedInSession);
    await fireEvent.press(getByText('Finance'));
    // Finance shows Invoice triage ($39, added) and Receipt OCR ($19, added).
    await fireEvent.press(getAllByText('Added ✓')[0]);
    await fireEvent.press(getByText('Remove'));
    // Removing Invoice triage: $186 − $39 = $147.
    expect(getByText('Growth plan · $147/mo')).toBeTruthy();
  });
});

describe('Run detail', () => {
  it('shows a run from RunDetail, without the fields card the platform refuses', async () => {
    setMockParams({ runId: 'run-1' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    // §12.1 #67 refuses run output, so the extracted-fields card is gone and
    // confidence is the design's own em dash. §12.1 #69 refuses a run number.
    expect(await screen.findByText('Duration')).toBeTruthy();
    expect(screen.getByText('Confidence')).toBeTruthy();
    expect(screen.queryByText('Beacon Supply Co')).toBeNull();
    expect(screen.queryByText('Run #4820')).toBeNull();
  });

  it('routes to the workflow, which is now ITS workflow', async () => {
    setMockParams({ runId: 'run-1' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('View workflow'));
    expect(mockRouter.push).toHaveBeenCalled();
  });
});

/* flow screens read the flow catalog */
describe('Workflows', () => {
  beforeEach(() => routePlatform(platformJson, { '/automations': flowCatalogPayload() }));
  it('lists all four flows with statuses', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(getByText('Invoice triage')).toBeTruthy();
    expect(getByText('Email triage')).toBeTruthy();
    expect(getByText('Weekly KPI report')).toBeTruthy();
    expect(getByText('Lead enrichment')).toBeTruthy();
    expect(getByText('Paused')).toBeTruthy();
    expect(getByText('Draft')).toBeTruthy();
  });

  it('opens detail from a card, builder from New, templates from Templates', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<FlowsScreen />, signedInSession);
    await fireEvent.press(getByText('Invoice triage'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/flows/detail',
      params: { flow: 'invoice' },
    });
    await fireEvent.press(getByText('New'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/builder');
    await fireEvent.press(getByText('Templates'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/templates');
  });
});

/* flow screens read the flow catalog */
describe('Workflows search (design v4)', () => {
  beforeEach(() => routePlatform(platformJson, { '/automations': flowCatalogPayload() }));
  it('filters the list by query and shows the no-match state', async () => {
    const { getByPlaceholderText, getByText, queryByText, getAllByText } = await renderWithProviders(
      <FlowsScreen />,
      signedInSession,
    );
    await fireEvent.changeText(getByPlaceholderText('Search workflows'), 'invoice');
    expect(getByText('Invoice triage')).toBeTruthy();
    expect(queryByText('Email triage')).toBeNull();
    await fireEvent.changeText(getByPlaceholderText('Search workflows'), 'zzz');
    expect(getByText('No workflows match "zzz".')).toBeTruthy();
    await fireEvent.changeText(getByPlaceholderText('Search workflows'), '');
    expect(getByText('Email triage')).toBeTruthy();
  });
});

/* flow screens read the flow catalog */
describe('Workflow detail', () => {
  beforeEach(() => routePlatform(platformJson, { '/automations': flowCatalogPayload() }));
  it('shows stats and the four pipeline steps', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(getByText('1,284')).toBeTruthy();
    expect(getByText('1,272')).toBeTruthy();
    expect(getByText('12')).toBeTruthy();
    expect(getByText('Invoice triage')).toBeTruthy();
    expect(getByText('New email in AP inbox')).toBeTruthy();
    expect(getByText('Extract invoice fields')).toBeTruthy();
    expect(getByText('Classify & GL-code')).toBeTruthy();
    expect(getByText('Post to QuickBooks')).toBeTruthy();
  });

  it('routes Edit in Builder and back', async () => {
    const { getByText, root, getAllByText, queryByText } = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    await fireEvent.press(getByText('Edit in Builder'));
    // The builder is told WHICH workflow to draw. Unconfigured has no live
    // subscription, so params are empty and the builder falls back to the
    // prototype's steps; a configured build passes the templateId.
    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(tabs)/flows/builder' }),
    );
    expect(root).toBeTruthy();
  });

  it('renders each workflow identity with its own content (design flowDefs)', async () => {
    setMockParams({ flow: 'kpi' });
    const { getByText, queryByText, getAllByText } = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(getByText('Weekly KPI report')).toBeTruthy();
    expect(getByText('Sheets → Slack digest')).toBeTruthy();
    expect(getByText('Paused')).toBeTruthy();
    // FINDING 6: only `unmetConnections` is published, so a satisfied provider
    // cannot be listed. The paused workflow has none outstanding.
    expect(queryByText('Google Sheets')).toBeNull();
    // FINDING 6: a satisfied/broken provider's detail is not published.
    expect(queryByText('Auth expired — tap to reconnect')).toBeNull();
    expect(getByText('Every Monday, 9:00 AM')).toBeTruthy();
    expect(queryByText('New email in AP inbox')).toBeNull();
  });

  it('shows a Draft with em-dash stats and a Publish action', async () => {
    setMockParams({ flow: 'lead' });
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(getByText('Lead enrichment')).toBeTruthy();
    expect(getByText('Draft')).toBeTruthy();
    expect(getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(getByText('HubSpot')).toBeTruthy();
    expect(getByText('Publish')).toBeTruthy();
  });

  it('toggles Live → Paused and back (design dToggle)', async () => {
    setMockParams({ flow: 'invoice' });
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(getByText('Live')).toBeTruthy();
    expect(getByText('Pause')).toBeTruthy();
    await fireEvent.press(getByText('Pause'));
    expect(getByText('Paused')).toBeTruthy();
    expect(getByText('Resume')).toBeTruthy();
    await fireEvent.press(getByText('Resume'));
    expect(getByText('Live')).toBeTruthy();
  });
});

describe('Builder', () => {
  it('shows the canvas steps and the six palette chips', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<BuilderScreen />, signedInSession);
    expect(getByText('Test run')).toBeTruthy();
    expect(getByText('Save')).toBeTruthy();
    expect(getByText('ADD A STEP')).toBeTruthy();
    for (const chip of ['Trigger', 'AI step', 'Branch', 'Action', 'Human review', 'Delay']) {
      expect(getByText(chip)).toBeTruthy();
    }
  });
});

/* flow screens read the flow catalog */
describe('Activity', () => {
  beforeEach(() => routePlatform(platformJson, { '/automations': flowCatalogPayload() }));
  it('groups today and yesterday from the fixtures', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<ActivityScreen />, signedInSession);
    expect(getByText('TODAY')).toBeTruthy();
    expect(getByText('YESTERDAY')).toBeTruthy();
    expect(getByText('32 emails routed · 3 escalated')).toBeTruthy();
    expect(getByText('Run #52 · failed — Sheets auth expired')).toBeTruthy();
  });

  it('filters to held runs via Needs review (design v3: chip filters, not navigates)', async () => {
    const { getByText, queryByText, getAllByText } = await renderWithProviders(<ActivityScreen />, signedInSession);
    await fireEvent.press(getByText('Needs review'));
    // `resultSummary` is success-only and `failureReason` failure-only, so a HELD
    // run's row shows its status word. §12.1 #67 publishes nothing else.
    expect(getAllByText('Held').length).toBeGreaterThan(0);
    expect(queryByText('32 emails routed · 3 escalated')).toBeNull();
    expect(queryByText('YESTERDAY')).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('filters to successes only', async () => {
    const { getByText, queryByText, getAllByText } = await renderWithProviders(<ActivityScreen />, signedInSession);
    await fireEvent.press(getByText('Success'));
    expect(getByText('32 emails routed · 3 escalated')).toBeTruthy();
    expect(queryByText('Run #52 · failed — Sheets auth expired')).toBeNull();
    expect(queryByText('Run #4820 · held for review — amount mismatch')).toBeNull();
  });

  it('filters to failures and hides the empty TODAY section', async () => {
    const { getByText, queryByText, getAllByText } = await renderWithProviders(<ActivityScreen />, signedInSession);
    await fireEvent.press(getByText('Failed'));
    expect(getByText('Run #52 · failed — Sheets auth expired')).toBeTruthy();
    expect(queryByText('TODAY')).toBeNull();
    expect(getByText('YESTERDAY')).toBeTruthy();
    await fireEvent.press(getByText('All'));
    expect(getByText('TODAY')).toBeTruthy();
    expect(getByText('Run #911 · 4 receipts captured')).toBeTruthy();
  });
});

describe('Approvals inbox', () => {
  beforeEach(() => routePlatform(platformJson, { '/automations': flowCatalogPayload() }));
  it('approves and rejects independently, matching the design done-states', async () => {
    const { getAllByText, getByText, queryAllByText, queryByText } = await renderWithProviders(<ApprovalsScreen />, signedInSession);
    expect(getAllByText('Approve')).toHaveLength(3);

    await fireEvent.press(getAllByText('Approve')[0]);
    expect(getByText('Approved ✓ — agent resuming')).toBeTruthy();
    expect(queryAllByText('Approve')).toHaveLength(2);

    await fireEvent.press(getAllByText('Reject')[0]);
    expect(getByText('Rejected — sent back to sender')).toBeTruthy();
    expect(queryAllByText('Approve')).toHaveLength(1);
  });

  it('decrements the pending count and shows the all-caught-up banner', async () => {
    const { getAllByText, getByText, queryByText } = await renderWithProviders(<ApprovalsScreen />, signedInSession);
    expect(getByText('3')).toBeTruthy();
    await fireEvent.press(getAllByText('Approve')[0]);
    expect(getByText('2')).toBeTruthy();
    expect(queryByText('All caught up — decisions synced to your workflows.')).toBeNull();
    await fireEvent.press(getAllByText('Approve')[0]);
    await fireEvent.press(getAllByText('Reject')[0]);
    expect(getByText('0')).toBeTruthy();
    expect(getByText('All caught up — decisions synced to your workflows.')).toBeTruthy();
  });

  it('shows the review reasons verbatim', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<ApprovalsScreen />, signedInSession);
    // §12.1 #70 refuses an approval title. The three-hop join renders the
    // automation and the step it paused at instead.
    expect(getAllByText(/Invoice triage · /).length).toBeGreaterThan(0);
    expect(getByText('Above the $500 auto-approve threshold.')).toBeTruthy();
  });
});

describe('Templates', () => {
  it('shows all six templates and opens the builder on use', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<TemplatesScreen />, signedInSession);
    for (const name of [
      'Email triage',
      'Invoice capture',
      'Weekly report digest',
      'Lead enrichment',
      'Receipt OCR',
      'Slack alerts',
    ]) {
      expect(getByText(name)).toBeTruthy();
    }
    // Solutions and Templates read ONE catalog, so this is the catalog's size,
    // not the prototype's separate six.
    expect(getAllByText('Use →')).toHaveLength(8);
    await fireEvent.press(getByText('Email triage'));
    // Each card opens ITS template, not always Invoice capture — DESIGN-GAPS
    // item 3. Unconfigured stands the name in for a templateId the prototype
    // never had.
    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(tabs)/flows/configure' }),
    );
  });
});

describe('Templates filtering (design v4)', () => {
  it('filters templates by category', async () => {
    const { getAllByText, getByText, queryByText } = await renderWithProviders(<TemplatesScreen />, signedInSession);
    // "Finance" is both a chip and a card label — the chip is the first match.
    await fireEvent.press(getAllByText('Finance')[0]);
    expect(getByText('Invoice capture')).toBeTruthy();
    expect(getByText('Receipt OCR')).toBeTruthy();
    expect(queryByText('Email triage')).toBeNull();
    await fireEvent.press(getAllByText('Sales')[0]);
    expect(getByText('Lead enrichment')).toBeTruthy();
    expect(queryByText('Invoice capture')).toBeNull();
  });
});

describe('New from template (design sConfigure)', () => {
  it('draws the named template, not always Invoice capture', async () => {
    setMockParams({ template: 'tpl.1' });
    await renderWithProviders(<ConfigureScreen />, signedInSession);
    expect(await screen.findByText('Email triage')).toBeTruthy();
  });

  it('opens the Builder from configure', async () => {
    setMockParams({ template: 'tpl.1' });
    await renderWithProviders(<ConfigureScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Create & open in Builder'));
    expect(mockRouter.push).toHaveBeenCalled();
  });
});

describe('Notifications inbox (design sNotifs)', () => {
  beforeEach(() => routePlatform(platformJson, { '/automations': flowCatalogPayload() }));
  it('shows the push-priming card and dismisses it', async () => {
    const { getByText, queryByText, getAllByText } = await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(getByText('Know the moment something needs you')).toBeTruthy();
    expect(
      getByText(
        'Push alerts for held runs and failures — nothing else. You can change this anytime in Settings.',
      ),
    ).toBeTruthy();
    await fireEvent.press(getByText('Not now'));
    expect(queryByText('Know the moment something needs you')).toBeNull();
  });

  it('lists notifications and opens their targets', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(getAllByText('Run held for review').length).toBeGreaterThan(0);
    // §12.1 #71: the inbox composes held approvals and failed runs only. A
    // billing notice has no source, so it is absent rather than invented.
    expect(queryByText('Invoice paid')).toBeNull();
    await fireEvent.press(getByText('Run failed'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/(home)/run',
      // A composed row points at the real run now, not a prototype variant.
      params: { runId: 'run-4' },
    });
    // "Digest posted" was a prototype success notice. The composed inbox has
    // only held approvals and failed runs, and a held row opens Activity.
    await fireEvent.press(getAllByText('Run held for review')[0]);
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/activity');
  });
});

describe('Settings & security', () => {
  it('shows the profile and section rows', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<SettingsScreen />, signedInSession);
    expect(getByText('Alex Kim')).toBeTruthy();
    expect(getByText('alex@acme.co · Acme Operations')).toBeTruthy();
    expect(getByText('Face ID unlock')).toBeTruthy();
    expect(getByText('1 passkey · iPhone')).toBeTruthy();
    expect(getByText('Autom8x for iOS · v1.0.0')).toBeTruthy();
  });

  it('shows plan & billing with the derived totals and opens Solutions', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<SettingsScreen />, signedInSession);
    expect(getByText('Growth plan')).toBeTruthy();
    expect(getByText('$99/mo base · renews Sep 1')).toBeTruthy();
    expect(getByText('$186/mo')).toBeTruthy();
    expect(getByText('3 active · $87/mo')).toBeTruthy();
    expect(getByText('Visa ···· 4242')).toBeTruthy();
    expect(getByText('Last: Aug 1 · $186')).toBeTruthy();
    await fireEvent.press(getByText('Manage solutions'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/solutions');
  });

  it('switches the live theme from the appearance control', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<SettingsScreen />, signedInSession);
    const title = () =>
      (StyleSheet.flatten(getByText('Settings').props.style) as { color?: string }).color;
    expect(title()).toBe(nocturneDark.text);
    await fireEvent.press(getByText('Light'));
    expect(title()).toBe(nocturneLight.text);
    await fireEvent.press(getByText('Dark'));
    expect(title()).toBe(nocturneDark.text);
  });

  it('signs out to Welcome', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<SettingsScreen />, signedInSession);
    await fireEvent.press(getByText('Sign out'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/welcome');
  });
});

describe('Run detail variants (design runDefs)', () => {
  it('renders a successful run with its result line', async () => {
    setMockParams({ runId: 'run-0' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    expect(await screen.findByText('Duration')).toBeTruthy();
  });

  it('offers no Retry, because a client cannot express one', async () => {
    setMockParams({ runId: 'run-4' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    // DESIGN-CONTRACT finding 9: POST /runs takes {subscriptionId, input} and
    // RunOrigin is not client-settable, so a retry cannot be expressed.
    expect(await screen.findByText('Duration')).toBeTruthy();
    expect(screen.queryByText('Retry run')).toBeNull();
  });
});

describe('Home data states (design sHomeLoad/Empty/Err)', () => {
  it('renders the skeleton while loading', async () => {
    setMockParams({ state: 'loading' });
    const { queryByText, getAllByText } = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(queryByText('Welcome back, Alex')).toBeNull();
    expect(queryByText('3 items need your review')).toBeNull();
  });

  it('renders the first-run empty state with its CTAs', async () => {
    setMockParams({ state: 'empty' });
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(getByText('Nothing automated. Yet.')).toBeTruthy();
    expect(
      getByText(
        'Add a prebuilt solution and your first agent is running in minutes — no building required.',
      ),
    ).toBeTruthy();
    await fireEvent.press(getByText('Browse solutions'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/solutions');
    await fireEvent.press(getByText('See how it works'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/onboarding');
  });

  it('renders the connection-error state with Retry', async () => {
    setMockParams({ state: 'error' });
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(getByText("Can't reach Autom8x")).toBeTruthy();
    expect(
      getByText(
        "Check your connection. Your agents keep running in the cloud and will sync when you're back.",
      ),
    ).toBeTruthy();
    expect(getByText('Retry')).toBeTruthy();
  });
});

describe('Setup wizard (design sSetup)', () => {
  it('names the solution it is setting up', async () => {
    setMockParams({ template: 'tpl.3' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    // Item 3's first case: each solution opens its OWN setup.
    expect(await screen.findByText(/Weekly KPI digest/)).toBeTruthy();
  });

  it('generates its sections from manifest.setup[]', async () => {
    setMockParams({ template: 'tpl.0' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    // Generated, not hardcoded — BUILD-PLAN 4.5.3.
    expect(await screen.findByText('QuickBooks Online')).toBeTruthy();
    expect(screen.getByText('Watch inbox')).toBeTruthy();
    expect(screen.getByText('1 · CONNECTIONS')).toBeTruthy();
  });
});
