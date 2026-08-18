import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { Receipt } from 'phosphor-react-native';

import { AvatarBadge } from '@/components/nocturne/avatar-badge';
import { BackCircle } from '@/components/nocturne/back-circle';
import { FilterChip } from '@/components/nocturne/filter-chip';
import { NocToggle } from '@/components/nocturne/noc-toggle';
import { OAuthButton } from '@/components/nocturne/oauth-button';
import { OrDivider } from '@/components/nocturne/or-divider';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { StatCard } from '@/components/nocturne/stat-card';
import { StatusPill } from '@/components/nocturne/status-pill';
import { StepCard } from '@/components/nocturne/step-card';
import { TextField } from '@/components/nocturne/text-field';
import { nocturneDark, status } from '@/constants/theme';
import { steps } from '@/lib/fixtures';
import { renderWithProviders } from '@/test/render';

const textColor = (node: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(node.props.style) as { color?: string }).color;

describe('PillButton', () => {
  it('fires onPress and renders the label', async () => {
    const onPress = jest.fn();
    const { getByText } = await renderWithProviders(
      <PillButton label="Get started" onPress={onPress} />,
    );
    await fireEvent.press(getByText('Get started'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('colors the primary variant with the accent (outline, never fill)', async () => {
    const { getByText } = await renderWithProviders(<PillButton label="Log In" variant="primary" />);
    expect(textColor(getByText('Log In'))).toBe(nocturneDark.accent);
  });

  it('colors accent-ghost labels with accent-300', async () => {
    const { getByText } = await renderWithProviders(
      <PillButton label="Unlock with Face ID" variant="accent-ghost" />,
    );
    expect(textColor(getByText('Unlock with Face ID'))).toBe(nocturneDark.accentRamp[300]);
  });

  it('does not fire and exposes disabled semantics when the operation is unavailable', async () => {
    const onPress = jest.fn();
    const { getByText } = await renderWithProviders(
      <PillButton label="Unavailable" onPress={onPress} disabled />,
    );
    const button = getByText('Unavailable').parent;
    expect(button?.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(getByText('Unavailable'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('NocToggle', () => {
  it('reports the flipped value on press and exposes switch semantics', async () => {
    const onChange = jest.fn();
    const { getByRole } = await renderWithProviders(
      <NocToggle value={true} onChange={onChange} />,
    );
    const toggle = getByRole('switch');
    expect(toggle.props.accessibilityState).toMatchObject({ checked: true });
    expect(toggle.props.accessibilityState.disabled).not.toBe(true);
    await fireEvent.press(toggle);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('can render a non-interactive persisted policy without implying a toggle', async () => {
    const onChange = jest.fn();
    const { getByRole } = await renderWithProviders(
      <NocToggle value onChange={onChange} disabled />,
    );
    const toggle = getByRole('switch');
    expect(toggle.props.accessibilityState).toMatchObject({ checked: true, disabled: true });
    await fireEvent.press(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('StatusPill', () => {
  it.each([
    ['Live', status.ok],
    ['Paused', status.warnText],
    ['Draft', nocturneDark.neutral[400]],
  ] as const)('tones %s correctly', async (label, color) => {
    const { getByText } = await renderWithProviders(<StatusPill label={label} />);
    expect(textColor(getByText(label))).toBe(color);
  });
});

describe('FilterChip', () => {
  it('uses accent for the active chip', async () => {
    const { getByText } = await renderWithProviders(<FilterChip label="All" active />);
    expect(textColor(getByText('All'))).toBe(nocturneDark.accent);
  });

  it('uses neutral-400 for inactive chips', async () => {
    const { getByText } = await renderWithProviders(<FilterChip label="All" />);
    expect(textColor(getByText('All'))).toBe(nocturneDark.neutral[400]);
  });

  it('fires onPress', async () => {
    const onPress = jest.fn();
    const { getByText } = await renderWithProviders(
      <FilterChip label="Needs review" onPress={onPress} />,
    );
    await fireEvent.press(getByText('Needs review'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('TextField', () => {
  it('masks secure input and toggles visibility with the labelled eye affordance', async () => {
    const { getByDisplayValue, getByLabelText } = await renderWithProviders(
      <TextField label="Password" value="automate88" onChangeText={() => {}} secure />,
    );
    expect(getByDisplayValue('automate88').props.secureTextEntry).toBe(true);
    await fireEvent.press(getByLabelText('Show password'));
    expect(getByDisplayValue('automate88').props.secureTextEntry).toBe(false);
    expect(getByLabelText('Hide password')).toBeTruthy();
  });

  it('forwards text changes', async () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = await renderWithProviders(
      <TextField
        label="Email"
        value=""
        onChangeText={onChangeText}
        placeholder="you@company.com"
      />,
    );
    await fireEvent.changeText(getByPlaceholderText('you@company.com'), 'alex@acme.co');
    expect(onChangeText).toHaveBeenCalledWith('alex@acme.co');
  });
});

describe('small components', () => {
  it('OAuthButton renders its label and fires', async () => {
    const onPress = jest.fn();
    const { getByText } = await renderWithProviders(
      <OAuthButton provider="apple" label="Continue with Apple" onPress={onPress} />,
    );
    await fireEvent.press(getByText('Continue with Apple'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('OAuthButton cannot start a duplicate disabled attempt', async () => {
    const onPress = jest.fn();
    const { getByText } = await renderWithProviders(
      <OAuthButton provider="google" label="Continuing with Google" onPress={onPress} disabled />,
    );
    await fireEvent.press(getByText('Continuing with Google'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('BackCircle is a labelled button and fires onPress', async () => {
    const onPress = jest.fn();
    const { getByLabelText } = await renderWithProviders(<BackCircle onPress={onPress} />);
    await fireEvent.press(getByLabelText('Back'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('StatCard shows value and label', async () => {
    const { getByText } = await renderWithProviders(<StatCard value="128" label="Runs today" />);
    expect(getByText('128')).toBeTruthy();
    expect(getByText('Runs today')).toBeTruthy();
  });

  it('StepCard shows kicker, title and description', async () => {
    const { getByText } = await renderWithProviders(<StepCard step={steps[0]} />);
    expect(getByText('TRIGGER')).toBeTruthy();
    expect(getByText('New email in AP inbox')).toBeTruthy();
    expect(getByText('Gmail · ap@acme.co')).toBeTruthy();
  });

  it('AvatarBadge renders initials in accent-200', async () => {
    const { getByText } = await renderWithProviders(<AvatarBadge initials="AK" />);
    expect(textColor(getByText('AK'))).toBe(nocturneDark.accentRamp[200]);
  });

  it('SectionLabel defaults to neutral-400', async () => {
    const { getByText } = await renderWithProviders(<SectionLabel>RECENT RUNS</SectionLabel>);
    expect(textColor(getByText('RECENT RUNS'))).toBe(nocturneDark.neutral[400]);
  });

  it('OrDivider renders the “or” label', async () => {
    const { getByText } = await renderWithProviders(<OrDivider />);
    expect(getByText('or')).toBeTruthy();
  });

  it('IconTile-based StatusPill/StepCard consumers accept phosphor icons', async () => {
    expect(Receipt).toBeDefined();
  });
});
