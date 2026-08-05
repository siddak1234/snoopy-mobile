import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent } from '@testing-library/react-native';

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
import { nocturneDark, nocturneLight } from '@/constants/theme';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

describe('Home dashboard', () => {
  it('shows greeting, stats and recent runs from the fixtures', async () => {
    const { getByText } = await renderWithProviders(<HomeScreen />);
    expect(getByText('Welcome back, Alex')).toBeTruthy();
    expect(getByText('Your agents ran 128 tasks while you were away.')).toBeTruthy();
    expect(getByText('128')).toBeTruthy();
    expect(getByText('124')).toBeTruthy();
    expect(getByText('4')).toBeTruthy();
    expect(getByText('Successes')).toBeTruthy();
    expect(getByText('Failures')).toBeTruthy();
    expect(getByText('3 items need your review')).toBeTruthy();
    expect(getByText('#4821 · posted to QuickBooks')).toBeTruthy();
  });

  it('routes every affordance per the design flow map', async () => {
    const { getByText } = await renderWithProviders(<HomeScreen />);
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
    const { getByText } = await renderWithProviders(<HomeScreen />);
    await fireEvent.press(getByText('#4821 · posted to QuickBooks'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/(home)/run',
      params: { variant: 'success' },
    });
  });
});

describe('Solutions marketplace', () => {
  it('lists the six solutions with prices and the live plan total', async () => {
    const { getByText, getAllByText } = await renderWithProviders(<SolutionsScreen />);
    expect(getByText('Growth plan · $186/mo')).toBeTruthy();
    expect(getByText('3 active · manage in Settings')).toBeTruthy();
    expect(getByText('Weekly KPI digest')).toBeTruthy();
    expect(getByText('Finance · $39/mo')).toBeTruthy();
    expect(getByText('Ops · $9/mo')).toBeTruthy();
    expect(getAllByText('Added ✓')).toHaveLength(3);
    expect(getAllByText('Add')).toHaveLength(3);
  });

  it('Add opens the Setup wizard with the solution index (design v3)', async () => {
    const { getAllByText } = await renderWithProviders(<SolutionsScreen />);
    // First not-added solution is Weekly KPI digest (index 3).
    await fireEvent.press(getAllByText('Add')[0]);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/solutions/setup',
      params: { index: '3' },
    });
  });

  it('removal goes through the confirm dialog (design rmOpen)', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<SolutionsScreen />);
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
    const { getByText } = await renderWithProviders(<SolutionsScreen />);
    await fireEvent.press(getByText('3 active · manage in Settings'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings');
  });

  it('filters the marketplace by category', async () => {
    const { getByText, queryByText } = await renderWithProviders(<SolutionsScreen />);
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
    const { getByText, getAllByText } = await renderWithProviders(<SolutionsScreen />);
    await fireEvent.press(getByText('Finance'));
    // Finance shows Invoice triage ($39, added) and Receipt OCR ($19, added).
    await fireEvent.press(getAllByText('Added ✓')[0]);
    await fireEvent.press(getByText('Remove'));
    // Removing Invoice triage: $186 − $39 = $147.
    expect(getByText('Growth plan · $147/mo')).toBeTruthy();
  });
});

describe('Run detail', () => {
  it('shows the held run with timeline and extracted fields', async () => {
    const { getByText } = await renderWithProviders(<RunDetailScreen />);
    expect(getByText('Run #4820')).toBeTruthy();
    expect(getByText('Invoice triage · today, 9:41 AM')).toBeTruthy();
    expect(getByText('Held')).toBeTruthy();
    expect(getByText('38s')).toBeTruthy();
    expect(getByText('3 / 4')).toBeTruthy();
    expect(getByText('87%')).toBeTruthy();
    expect(getByText('Held for review')).toBeTruthy();
    expect(getByText('Waiting on your approval')).toBeTruthy();
    expect(getByText('9:41:40')).toBeTruthy();
    expect(getByText('Beacon Supply Co')).toBeTruthy();
    expect(getByText('$12,480.00')).toBeTruthy();
    expect(getByText('#8841')).toBeTruthy();
    expect(getByText('Sep 3, 2026')).toBeTruthy();
  });

  it('routes to approvals and the workflow detail', async () => {
    const { getByText } = await renderWithProviders(<RunDetailScreen />);
    await fireEvent.press(getByText('Review & approve'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/activity/approvals');
    await fireEvent.press(getByText('View workflow'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/detail');
  });
});

describe('Workflows', () => {
  it('lists all four flows with statuses', async () => {
    const { getByText } = await renderWithProviders(<FlowsScreen />);
    expect(getByText('Invoice triage')).toBeTruthy();
    expect(getByText('Email triage')).toBeTruthy();
    expect(getByText('Weekly KPI report')).toBeTruthy();
    expect(getByText('Lead enrichment')).toBeTruthy();
    expect(getByText('Paused')).toBeTruthy();
    expect(getByText('Draft')).toBeTruthy();
  });

  it('opens detail from a card, builder from New, templates from Templates', async () => {
    const { getByText } = await renderWithProviders(<FlowsScreen />);
    await fireEvent.press(getByText('Invoice triage'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/detail');
    await fireEvent.press(getByText('New'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/builder');
    await fireEvent.press(getByText('Templates'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/templates');
  });
});

describe('Workflow detail', () => {
  it('shows stats and the four pipeline steps', async () => {
    const { getByText } = await renderWithProviders(<WorkflowDetailScreen />);
    expect(getByText('1,284')).toBeTruthy();
    expect(getByText('1,272')).toBeTruthy();
    expect(getByText('12')).toBeTruthy();
    expect(getByText('New email in AP inbox')).toBeTruthy();
    expect(getByText('Extract invoice fields')).toBeTruthy();
    expect(getByText('Classify & GL-code')).toBeTruthy();
    expect(getByText('Post to QuickBooks')).toBeTruthy();
  });

  it('routes Edit in Builder and back', async () => {
    const { getByText, root } = await renderWithProviders(<WorkflowDetailScreen />);
    await fireEvent.press(getByText('Edit in Builder'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/builder');
    expect(root).toBeTruthy();
  });
});

describe('Builder', () => {
  it('shows the canvas steps and the six palette chips', async () => {
    const { getByText } = await renderWithProviders(<BuilderScreen />);
    expect(getByText('Test run')).toBeTruthy();
    expect(getByText('Save')).toBeTruthy();
    expect(getByText('ADD A STEP')).toBeTruthy();
    for (const chip of ['Trigger', 'AI step', 'Branch', 'Action', 'Human review', 'Delay']) {
      expect(getByText(chip)).toBeTruthy();
    }
  });
});

describe('Activity', () => {
  it('groups today and yesterday from the fixtures', async () => {
    const { getByText } = await renderWithProviders(<ActivityScreen />);
    expect(getByText('TODAY')).toBeTruthy();
    expect(getByText('YESTERDAY')).toBeTruthy();
    expect(getByText('32 emails routed · 3 escalated')).toBeTruthy();
    expect(getByText('Run #52 · failed — Sheets auth expired')).toBeTruthy();
  });

  it('filters to held runs via Needs review (design v3: chip filters, not navigates)', async () => {
    const { getByText, queryByText } = await renderWithProviders(<ActivityScreen />);
    await fireEvent.press(getByText('Needs review'));
    expect(getByText('Run #4820 · held for review — amount mismatch')).toBeTruthy();
    expect(queryByText('32 emails routed · 3 escalated')).toBeNull();
    expect(queryByText('YESTERDAY')).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('filters to successes only', async () => {
    const { getByText, queryByText } = await renderWithProviders(<ActivityScreen />);
    await fireEvent.press(getByText('Success'));
    expect(getByText('32 emails routed · 3 escalated')).toBeTruthy();
    expect(queryByText('Run #52 · failed — Sheets auth expired')).toBeNull();
    expect(queryByText('Run #4820 · held for review — amount mismatch')).toBeNull();
  });

  it('filters to failures and hides the empty TODAY section', async () => {
    const { getByText, queryByText } = await renderWithProviders(<ActivityScreen />);
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
  it('approves and rejects independently, matching the design done-states', async () => {
    const { getAllByText, getByText, queryAllByText } = await renderWithProviders(<ApprovalsScreen />);
    expect(getAllByText('Approve')).toHaveLength(3);

    await fireEvent.press(getAllByText('Approve')[0]);
    expect(getByText('Approved ✓ — agent resuming')).toBeTruthy();
    expect(queryAllByText('Approve')).toHaveLength(2);

    await fireEvent.press(getAllByText('Reject')[0]);
    expect(getByText('Rejected — sent back to sender')).toBeTruthy();
    expect(queryAllByText('Approve')).toHaveLength(1);
  });

  it('shows the review reasons verbatim', async () => {
    const { getByText } = await renderWithProviders(<ApprovalsScreen />);
    expect(getByText('Invoice #4821 · Beacon Supply Co')).toBeTruthy();
    expect(getByText('Above the $500 auto-approve threshold.')).toBeTruthy();
  });
});

describe('Templates', () => {
  it('shows all six templates and opens the builder on use', async () => {
    const { getByText, getAllByText } = await renderWithProviders(<TemplatesScreen />);
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
    expect(getAllByText('Use →')).toHaveLength(6);
    await fireEvent.press(getByText('Email triage'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/builder');
  });
});

describe('Settings & security', () => {
  it('shows the profile and section rows', async () => {
    const { getByText } = await renderWithProviders(<SettingsScreen />);
    expect(getByText('Alex Kim')).toBeTruthy();
    expect(getByText('alex@acme.co · Acme Operations')).toBeTruthy();
    expect(getByText('Face ID unlock')).toBeTruthy();
    expect(getByText('1 passkey · iPhone')).toBeTruthy();
    expect(getByText('Autom8x for iOS · v1.0.0')).toBeTruthy();
  });

  it('shows plan & billing with the derived totals and opens Solutions', async () => {
    const { getByText } = await renderWithProviders(<SettingsScreen />);
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
    const { getByText } = await renderWithProviders(<SettingsScreen />);
    const title = () =>
      (StyleSheet.flatten(getByText('Settings').props.style) as { color?: string }).color;
    expect(title()).toBe(nocturneDark.text);
    await fireEvent.press(getByText('Light'));
    expect(title()).toBe(nocturneLight.text);
    await fireEvent.press(getByText('Dark'));
    expect(title()).toBe(nocturneDark.text);
  });

  it('signs out to Welcome', async () => {
    const { getByText } = await renderWithProviders(<SettingsScreen />);
    await fireEvent.press(getByText('Sign out'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/welcome');
  });
});

describe('Run detail variants (design runDefs)', () => {
  it('renders the successful run without a primary action', async () => {
    setMockParams({ variant: 'success' });
    const { getByText, queryByText } = await renderWithProviders(<RunDetailScreen />);
    expect(getByText('Run #4821')).toBeTruthy();
    expect(getByText('Success')).toBeTruthy();
    expect(getByText('Posted to QuickBooks')).toBeTruthy();
    expect(getByText('Bill #10412 created, PDF attached')).toBeTruthy();
    expect(queryByText('Review & approve')).toBeNull();
    expect(getByText('Beacon Supply Co')).toBeTruthy();
  });

  it('renders the failed run without extracted fields and with Retry', async () => {
    setMockParams({ variant: 'failed' });
    const { getByText, queryByText } = await renderWithProviders(<RunDetailScreen />);
    expect(getByText('Run #52')).toBeTruthy();
    expect(getByText('Failed')).toBeTruthy();
    expect(getByText('Sheets connection failed')).toBeTruthy();
    expect(getByText('Auth token revoked — reconnect Google Sheets')).toBeTruthy();
    expect(getByText('Retry run')).toBeTruthy();
    expect(queryByText('EXTRACTED FIELDS')).toBeNull();
    expect(queryByText('Beacon Supply Co')).toBeNull();
  });
});

describe('Home data states (design sHomeLoad/Empty/Err)', () => {
  it('renders the skeleton while loading', async () => {
    setMockParams({ state: 'loading' });
    const { queryByText } = await renderWithProviders(<HomeScreen />);
    expect(queryByText('Welcome back, Alex')).toBeNull();
    expect(queryByText('3 items need your review')).toBeNull();
  });

  it('renders the first-run empty state with its CTAs', async () => {
    setMockParams({ state: 'empty' });
    const { getByText } = await renderWithProviders(<HomeScreen />);
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
    const { getByText } = await renderWithProviders(<HomeScreen />);
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
  it('gates activation on the QuickBooks connection', async () => {
    setMockParams({ index: '3' });
    const { getByText } = await renderWithProviders(<SetupScreen />);
    expect(getByText('Set up Weekly KPI digest')).toBeTruthy();
    expect(getByText('One-time setup · about 2 minutes')).toBeTruthy();
    expect(getByText('Required · sign in with OAuth once')).toBeTruthy();
    await fireEvent.press(getByText('Connect QuickBooks to activate'));
    expect(mockRouter.push).not.toHaveBeenCalled();
    await fireEvent.press(getByText('Connect'));
    expect(getByText('Connected ✓')).toBeTruthy();
    expect(getByText('acme-books · linked via OAuth')).toBeTruthy();
    await fireEvent.press(getByText('Activate solution'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/detail');
  });

  it('shows the setup sections verbatim', async () => {
    const { getByText } = await renderWithProviders(<SetupScreen />);
    expect(getByText('Watch inbox')).toBeTruthy();
    expect(getByText('ap@acme.co · label “AP-Invoices”')).toBeTruthy();
    expect(getByText('Hold when amount differs from PO')).toBeTruthy();
    expect(getByText('Hold above $500')).toBeTruthy();
    expect(getByText('Slack · #finance')).toBeTruthy();
    expect(getByText('Notify on holds and failures')).toBeTruthy();
  });
});
