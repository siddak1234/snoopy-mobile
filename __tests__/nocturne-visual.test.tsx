import React from 'react';
import { Text } from 'react-native';
import { Receipt } from 'phosphor-react-native';

import { AvatarBadge } from '@/components/nocturne/avatar-badge';
import { BackCircle } from '@/components/nocturne/back-circle';
import { BrandMark } from '@/components/nocturne/brand-mark';
import { FilterChip } from '@/components/nocturne/filter-chip';
import { GlowBackground } from '@/components/nocturne/glow-background';
import { IconTile } from '@/components/nocturne/icon-tile';
import { NocToggle } from '@/components/nocturne/noc-toggle';
import { OAuthButton } from '@/components/nocturne/oauth-button';
import { OrDivider } from '@/components/nocturne/or-divider';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { Skeleton } from '@/components/nocturne/skeleton';
import { StatCard } from '@/components/nocturne/stat-card';
import { StatusPill } from '@/components/nocturne/status-pill';
import { StepCard } from '@/components/nocturne/step-card';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { NocturneTabBar } from '@/components/nocturne/tab-bar';
import { TextField } from '@/components/nocturne/text-field';
import type { ThemeMode } from '@/hooks/use-theme';
import type { PipelineStep } from '@/lib/view/pipeline';
import { renderWithProviders } from '@/test/render';
import { stabilizeAnimated } from '@/test/stabilize';
import { makeTabBarProps } from '@/test/tab-bar-props';

/**
 * Visual regression for the Nocturne set.
 *
 * Gate 8 requires "Nocturne components unchanged — colour, spacing, type
 * scale", and nothing in this repository could produce that diff: there were no
 * snapshots, no `.snap` files, and no Playwright/Detox/Maestro. The rule was
 * reviewable but not checkable, which is the same failure mode the token
 * adherence config had.
 *
 * A rendered tree is the right instrument here. React Native styles resolve into
 * it, so a changed colour, padding, radius, font family or font size moves the
 * snapshot — which is precisely the three properties the gate names. It cannot
 * see a native layout bug, and does not claim to; what it holds is that a
 * refactor of what a screen *reads* did not disturb how a component *looks*.
 *
 * Both palettes are captured. Light is where colour regressions hide: it
 * overrides only part of the ramp and deliberately inherits the rest, so a token
 * removed from one end can go unnoticed in dark.
 *
 * `tab-bar` is snapshotted here too, sharing the navigation fake `tab-bar.test.tsx`
 * already depends on. That suite asserts label *colour* and press behaviour, which
 * left spacing and type scale — two of the three properties the gate names —
 * unchecked on the one component that frames every screen. An earlier note here
 * gave "constructing a convincing `BottomTabBarProps` would assert more about the
 * fake than about the component" as the reason to leave it out; the fake already
 * existed and was already trusted, so excluding it bought nothing.
 */

const PIPELINE_STEP: PipelineStep = {
  icon: Receipt,
  kicker: 'TRIGGER',
  title: 'New email in AP inbox',
  desc: 'Gmail · ap@acme.co',
  more: true,
};

/** One representative mounting per component, in the design's own vocabulary. */
const CASES: { name: string; element: React.ReactElement }[] = [
  { name: 'AvatarBadge', element: <AvatarBadge initials="DW" /> },
  { name: 'BackCircle', element: <BackCircle /> },
  { name: 'BrandMark', element: <BrandMark width={86} /> },
  { name: 'FilterChip/inactive', element: <FilterChip label="Finance" /> },
  { name: 'FilterChip/active', element: <FilterChip label="Finance" active /> },
  { name: 'GlowBackground', element: <GlowBackground /> },
  { name: 'IconTile', element: <IconTile icon={Receipt} /> },
  { name: 'NocToggle/on', element: <NocToggle value onChange={() => {}} /> },
  { name: 'NocToggle/off', element: <NocToggle value={false} onChange={() => {}} /> },
  { name: 'OAuthButton', element: <OAuthButton provider="google" label="Continue with Google" /> },
  { name: 'OrDivider', element: <OrDivider /> },
  { name: 'PillButton/primary', element: <PillButton label="Log In" variant="primary" /> },
  { name: 'PillButton/secondary', element: <PillButton label="Templates" variant="secondary" /> },
  { name: 'PillButton/accent-ghost', element: <PillButton label="Unlock" variant="accent-ghost" /> },
  { name: 'PillButton/plain', element: <PillButton label="See how it works" variant="plain" /> },
  { name: 'SectionLabel', element: <SectionLabel>Recent runs</SectionLabel> },
  { name: 'Skeleton', element: <Skeleton width={214} height={22} /> },
  { name: 'StatCard', element: <StatCard value="1,284" label="Runs today" /> },
  { name: 'StatusPill/Live', element: <StatusPill label="Live" /> },
  { name: 'StatusPill/Paused', element: <StatusPill label="Paused" /> },
  { name: 'StatusPill/Draft', element: <StatusPill label="Draft" /> },
  { name: 'StatusPill/Success', element: <StatusPill label="Success" /> },
  { name: 'StatusPill/Held', element: <StatusPill label="Held" /> },
  { name: 'StatusPill/Failed', element: <StatusPill label="Failed" /> },
  { name: 'StatusPill/Running', element: <StatusPill label="Running" /> },
  { name: 'StatusPill/Queued', element: <StatusPill label="Queued" /> },
  { name: 'StatusPill/Cancelled', element: <StatusPill label="Cancelled" /> },
  { name: 'StepCard', element: <StepCard step={PIPELINE_STEP} /> },
  {
    name: 'SurfaceCard',
    element: (
      <SurfaceCard>
        <Text>Body</Text>
      </SurfaceCard>
    ),
  },
  {
    name: 'TextField',
    element: <TextField label="Email" value="dana@northwind.example" onChangeText={() => {}} />,
  },
  {
    name: 'TextField/secure',
    element: <TextField label="Password" value="secret" onChangeText={() => {}} secure />,
  },
  { name: 'TabBar', element: <NocturneTabBar {...makeTabBarProps(0).props} /> },
];

describe.each<ThemeMode>(['dark', 'light'])('Nocturne set — %s palette', (mode) => {
  it.each(CASES.map((c) => [c.name, c.element] as const))('%s renders unchanged', async (_name, element) => {
    const { toJSON } = await renderWithProviders(element, undefined, mode);
    // `stabilizeAnimated` rounds sampled animation values and nothing else, so
    // Skeleton's pulse cannot make this gate fail at random. See test/stabilize.ts.
    expect(stabilizeAnimated(toJSON())).toMatchSnapshot();
  });
});
