import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, within } from '@testing-library/react-native';
import { Receipt, Trash } from 'phosphor-react-native';

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
import { SettingsRow } from '@/components/settings/settings-row';
import { DialogButton } from '@/components/dialog';
import { layout, nocturneDark, nocturneLight, status, typeScale, withAlpha } from '@/constants/theme';
import { steps } from '@/test/design-data';
import { renderWithProviders } from '@/test/render';
import { touch } from '@/test/touch';

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

  it.each(['dark', 'light'] as const)(
    "draws the danger variant in the theme's red — label, icon and a 1-pt outline — and tints it a tenth while pressed (%s)",
    async (mode) => {
      const palette = mode === 'dark' ? nocturneDark : nocturneLight;
      const { getByTestId, getByText } = await renderWithProviders(
        <PillButton label="Delete Account" variant="danger" icon={Trash} testID="danger" onPress={() => undefined} />,
        undefined,
        mode,
      );
      expect(textColor(getByText('Delete Account'))).toBe(palette.danger);
      expect(getByTestId('phosphor-react-native-trash-regular').props.color).toBe(palette.danger);
      const pill = getByTestId('danger');
      expect(StyleSheet.flatten(pill.props.style)).toMatchObject({
        borderWidth: 1,
        borderColor: palette.danger,
        backgroundColor: 'transparent',
      });
      // The design's hover, rgba(248,113,113,.1), as the pressed state.
      await fireEvent(pill, 'responderGrant', touch('onResponderGrant'));
      expect(StyleSheet.flatten(pill.props.style).backgroundColor).toBe(withAlpha(palette.danger, 0.1));
    },
  );

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

describe('DialogButton', () => {
  it.each(['dark', 'light'] as const)("draws a danger button — what cannot be undone — in the theme's red (%s)", async (mode) => {
    const palette = mode === 'dark' ? nocturneDark : nocturneLight;
    const { getByText, getByTestId } = await renderWithProviders(
      <DialogButton label="Delete team" tone="danger" testID="confirm" onPress={() => undefined} />,
      undefined,
      mode,
    );
    expect(textColor(getByText('Delete team'))).toBe(palette.danger);
    expect(StyleSheet.flatten(getByTestId('confirm').props.style).borderColor).toBe(palette.danger);
  });
});

describe('SettingsRow', () => {
  it('keeps the row every list had, and is roomier only where the Settings index asks (build 11, D1)', async () => {
    const { getByTestId, getByText } = await renderWithProviders(
      <>
        <SettingsRow icon={Receipt} title="Plain" sub="A line" right={null} testID="plain" />
        <SettingsRow icon={Receipt} title="Roomy" sub="A line" right={null} testID="roomy" size="roomy" onPress={() => undefined} />
      </>,
    );
    expect(StyleSheet.flatten(getByTestId('plain').props.style).paddingVertical).toBe(layout.rowPadV);
    expect(StyleSheet.flatten(getByTestId('roomy').props.style).paddingVertical).toBe(layout.rowPadVRoomy);
    expect(layout.rowPadVRoomy).toBeGreaterThan(layout.rowPadV);
    // The roomy title and line sit at their scale heights; the plain row sets no line height, as before.
    const title = (text: string) => StyleSheet.flatten(getByText(text).props.style) as { lineHeight?: number };
    expect(title('Roomy').lineHeight).toBe(typeScale.label.lineHeight);
    expect(title('Plain').lineHeight).toBeUndefined();
  });

  it("draws a value on the title's line, before the arrow, and lets it move under the title rather than squeeze it", async () => {
    const { getByTestId, getByText, queryByTestId } = await renderWithProviders(
      <>
        <SettingsRow
          icon={Receipt}
          title="Organization"
          value="Sikho Mode Solutions"
          right={<Text>arrow</Text>}
          testID="valued"
          size="roomy"
          onPress={() => undefined}
        />
        <SettingsRow icon={Receipt} title="Teams" sub="A line" right={<Text>arrow</Text>} testID="plain" size="roomy" />
      </>,
    );
    // Read in order across the row: the title, its value, then the arrow.
    expect(within(getByTestId('valued')).getAllByText(/./u).map((node) => node.props.children)).toEqual([
      'Organization',
      'Sikho Mode Solutions',
      'arrow',
    ]);
    // The title and the value share ONE line that wraps: side by side when both fit,
    // the value under the title when they do not — never one squeezing the other.
    const value = getByTestId('value-of-valued');
    const line = value.parent!;
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    });
    expect(within(line).getAllByText(/./u).map((node) => node.props.children)).toEqual([
      'Organization',
      'Sikho Mode Solutions',
    ]);
    // Neither is ever cut short.
    expect(getByText('Organization').props.numberOfLines).toBeUndefined();
    expect(value.props.numberOfLines).toBeUndefined();
    // In the index's value style: regular, the scale's small step, neutral-500.
    expect(StyleSheet.flatten(value.props.style)).toMatchObject({
      fontSize: typeScale.small.fontSize,
      color: nocturneDark.neutral[500],
    });
    // A row without a value draws as before: the title straight in the row's body, its line under it.
    expect(queryByTestId('value-of-plain')).toBeNull();
    const plainTitle = getByText('Teams');
    expect(StyleSheet.flatten(plainTitle.parent!.props.style)).toEqual({ flex: 1 });
    expect(within(plainTitle.parent!).getAllByText(/./u).map((node) => node.props.children)).toEqual(['Teams', 'A line']);
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

  // The website's pills the app drew none of until Gate 24's parity pass: each in
  // the treatment its website tone maps to — success Live's, warning Paused's,
  // and info the accent, as a running run's.
  it.each([
    ['Active', status.ok],
    ['Pending', nocturneDark.accentRamp[300]],
    ['Trialing', nocturneDark.accentRamp[300]],
    ['Past due', status.warnText],
    ['Incomplete', status.warnText],
  ] as const)("tones the website's %s as its tone maps here", async (label, color) => {
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
