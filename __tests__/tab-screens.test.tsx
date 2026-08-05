import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent } from '@testing-library/react-native';

import ActivityScreen from '@/app/(tabs)/activity/index';
import ApprovalsScreen from '@/app/(tabs)/activity/approvals';
import BuilderScreen from '@/app/(tabs)/builder';
import FlowsScreen from '@/app/(tabs)/flows/index';
import TemplatesScreen from '@/app/(tabs)/flows/templates';
import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import HomeScreen from '@/app/(tabs)/index';
import SettingsScreen from '@/app/(tabs)/settings';
import { nocturneDark, nocturneLight } from '@/constants/theme';
import { mockRouter, renderWithProviders } from '@/test/render';

describe('Home dashboard', () => {
  it('shows greeting, stats and recent runs from the fixtures', async () => {
    const { getByText } = await renderWithProviders(<HomeScreen />);
    expect(getByText('Welcome back, Alex')).toBeTruthy();
    expect(getByText('Your agents ran 128 tasks while you were away.')).toBeTruthy();
    expect(getByText('128')).toBeTruthy();
    expect(getByText('98.2%')).toBeTruthy();
    expect(getByText('6.4h')).toBeTruthy();
    expect(getByText('3 items need your review')).toBeTruthy();
    expect(getByText('#4821 · posted to QuickBooks')).toBeTruthy();
  });

  it('routes every affordance per the design flow map', async () => {
    const { getByText } = await renderWithProviders(<HomeScreen />);
    await fireEvent.press(getByText('3 items need your review'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/activity/approvals');
    await fireEvent.press(getByText('New workflow'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/builder');
    await fireEvent.press(getByText('Templates'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/templates');
    await fireEvent.press(getByText('See all'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/activity');
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
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/builder');
    await fireEvent.press(getByText('Templates'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/templates');
  });
});

describe('Workflow detail', () => {
  it('shows stats and the four pipeline steps', async () => {
    const { getByText } = await renderWithProviders(<WorkflowDetailScreen />);
    expect(getByText('1,284')).toBeTruthy();
    expect(getByText('99.1%')).toBeTruthy();
    expect(getByText('42s')).toBeTruthy();
    expect(getByText('New email in AP inbox')).toBeTruthy();
    expect(getByText('Extract invoice fields')).toBeTruthy();
    expect(getByText('Classify & GL-code')).toBeTruthy();
    expect(getByText('Post to QuickBooks')).toBeTruthy();
  });

  it('routes Edit in Builder and back', async () => {
    const { getByText, root } = await renderWithProviders(<WorkflowDetailScreen />);
    await fireEvent.press(getByText('Edit in Builder'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/builder');
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

  it('routes the Needs review chip to approvals', async () => {
    const { getByText } = await renderWithProviders(<ActivityScreen />);
    await fireEvent.press(getByText('Needs review'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/activity/approvals');
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
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/builder');
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
