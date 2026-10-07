/**
 * The cover after a sign-out is shown whole, at once — the owner's build 13
 * decision 1 ("if signed out then right away the get started page comes"). On a
 * cold start "Get started" still rises in; the flag a sign-out sets is the only
 * difference, and the session provider sets it only for a sign-out that revoked.
 */
import React from 'react';
import { StyleSheet } from 'react-native';

import SplashScreen from '@/app/index';
import { coverPlaysEntrance, noteSignedOut, resetCoverEntranceForTests } from '@/lib/view/cover-entrance';
import { renderWithProviders } from '@/test/render';

const opacityOf = (view: { props: Record<string, unknown> }) =>
  (StyleSheet.flatten(view.props.style as never) as { opacity?: number }).opacity;

describe('The cover after a sign-out (build 13 decision 1)', () => {
  afterEach(() => resetCoverEntranceForTests());

  it('plays its entrance on a cold start: Get started starts transparent', async () => {
    expect(coverPlaysEntrance()).toBe(true);
    const { getByTestId } = await renderWithProviders(<SplashScreen />);
    expect(opacityOf(getByTestId('cover-get-started'))).toBe(0);
  });

  it('after a sign-out shows Get started whole, with no entrance', async () => {
    noteSignedOut();
    expect(coverPlaysEntrance()).toBe(false);
    const { getByTestId } = await renderWithProviders(<SplashScreen />);
    expect(opacityOf(getByTestId('cover-get-started'))).toBe(1);
  });
});
