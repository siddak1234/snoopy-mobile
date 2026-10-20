import { screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import AuthLayout from '@/app/(auth)/_layout';
import TabLayout from '@/app/(tabs)/_layout';
import { GLASS_BACKING_ALPHA, nocturneDark, withAlpha } from '@/constants/theme';
import { mockTabsDrawn, renderWithProviders } from '@/test/render';
import type { SessionContextValue } from '@/hooks/use-session';

/**
 * Round 24 P11: one strip behind the status bar over every tab's screens, drawn
 * by the tabs' layout (never per screen), as tall as the top safe area (59 on
 * the design's phone), above the navigator, never taking a touch — and the same
 * strip over the sign-in stack, whose Sign in scrolls (the round's review).
 */

const signedIn: SessionContextValue = {
  status: 'signed-in',
  session: {
    authenticated: true,
    user: {
      userId: 'c1a9e7d2-4f30-4b8a-9e51-77c0d3f21a08',
      email: 'dana@northwind.example',
      aiDocumentReading: 'allowed',
      activeWorkspaceId: '5e4d1b90-2c77-4f16-8a03-9d61e4b7c520',
    },
    workspaces: [{ id: '5e4d1b90-2c77-4f16-8a03-9d61e4b7c520', name: 'Northwind Trading', type: 'organization', role: 'owner' }],
  },
  locked: false,
  unlock: () => {},
  refresh: () => {},
  reload: async () => ({ status: 'signed-in' as const }),
  signIn: async () => ({ status: 'cancelled' }),
  signOut: async () => ({ revoked: true }),
};

describe('the tabs layout', () => {
  it('draws the status-bar strip 59 tall at the top, after (over) the tab navigator, in the page colour', async () => {
    await renderWithProviders(<TabLayout />, signedIn);
    expect(mockTabsDrawn).toHaveBeenCalled();
    const strip = screen.getByTestId('status-bar-strip');
    const holder = strip.parent!;
    expect(StyleSheet.flatten(holder.props.style)).toMatchObject({ position: 'absolute', top: 0, left: 0, right: 0, height: 59 });
    expect(holder.props.pointerEvents).toBe('none');
    expect(StyleSheet.flatten(screen.getByTestId('status-bar-strip-backing').props.style).backgroundColor).toBe(
      withAlpha(nocturneDark.bg, GLASS_BACKING_ALPHA),
    );
    // The layout's own view holds the navigator first and the strip last: drawn over the screens.
    const layoutView = holder.parent!;
    expect(StyleSheet.flatten(layoutView.props.style)).toMatchObject({ flex: 1 });
    expect(layoutView.children[layoutView.children.length - 1]).toBe(holder);
  });

  it('draws nothing while the session is not open', async () => {
    await renderWithProviders(<TabLayout />, { ...signedIn, locked: true });
    expect(screen.queryByTestId('status-bar-strip')).toBeNull();
  });
});

describe('the sign-in stack\'s layout', () => {
  it('draws the same strip 59 tall at the top, after (over) the stack, in the page colour, signed out', async () => {
    await renderWithProviders(<AuthLayout />, { ...signedIn, status: 'signed-out' } as SessionContextValue);
    const strip = screen.getByTestId('status-bar-strip');
    const holder = strip.parent!;
    expect(StyleSheet.flatten(holder.props.style)).toMatchObject({ position: 'absolute', top: 0, left: 0, right: 0, height: 59 });
    expect(holder.props.pointerEvents).toBe('none');
    expect(StyleSheet.flatten(screen.getByTestId('status-bar-strip-backing').props.style).backgroundColor).toBe(
      withAlpha(nocturneDark.bg, GLASS_BACKING_ALPHA),
    );
    // The layout's own view, in the page colour, holds the stack first and the strip last.
    const layoutView = holder.parent!;
    expect(StyleSheet.flatten(layoutView.props.style)).toMatchObject({ flex: 1, backgroundColor: nocturneDark.bg });
    expect(layoutView.children[layoutView.children.length - 1]).toBe(holder);
  });
});
