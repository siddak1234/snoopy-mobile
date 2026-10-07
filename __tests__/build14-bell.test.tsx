import { screen } from '@testing-library/react-native';
import React from 'react';

import HomeScreen from '@/app/(tabs)/(home)/index';
import { PlatformError } from '@/lib/platform/problem';
import { inboxPayload, routePlatform, runsPayload, signedInSession } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

/**
 * Home's bell says the inbox holds something unread — the owner's build 13
 * decision 3A: read and dismissed are the platform's, so the dot is the
 * platform's unread count, the same on every device. Before, it lit for any
 * held or failed run, read or not, and never went out.
 */

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

jest.mock('@/lib/platform/scope-store', () => ({
  readScope: jest.fn(async () => null),
  writeScope: jest.fn(async () => undefined),
}));

beforeEach(() => platformOperation.mockReset());

/** The routing every Home test uses, with the inbox answering `inbox` (or refusing). */
function route(inbox: ReturnType<typeof inboxPayload> | Error) {
  routePlatform(platformOperation, inbox instanceof Error ? {} : { '/notifications': inbox });
  if (!(inbox instanceof Error)) return;
  const routed = platformOperation.getMockImplementation()!;
  platformOperation.mockImplementation((key: string, ...rest: unknown[]) =>
    key.endsWith('/notifications') ? Promise.reject(inbox) : routed(key, ...rest),
  );
}

describe("Home's bell (decision 3A)", () => {
  it('has its dot while the inbox holds something unread', async () => {
    route(inboxPayload());
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByLabelText('Notifications')).toBeTruthy();
    expect(screen.getByTestId('home-bell-dot')).toBeTruthy();
  });

  it('has none once everything is read, though runs are still held and failed', async () => {
    const inbox = inboxPayload();
    route({ items: inbox.items.map((item) => ({ ...item, read: true })), unreadCount: 0 });
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByLabelText('Notifications')).toBeTruthy();
    // The dashboard still shows a failed run and the review banner: the dot is not theirs.
    expect(runsPayload().runs.some((run) => run.status === 'failed')).toBe(true);
    expect(screen.getByText(/your review/u)).toBeTruthy();
    expect(screen.queryByTestId('home-bell-dot')).toBeNull();
  });

  it('a refused inbox read costs the dot, never the dashboard', async () => {
    route(new PlatformError('Service Unavailable', 503));
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByLabelText('Notifications')).toBeTruthy();
    expect(screen.getByText(/your review/u)).toBeTruthy();
    expect(screen.queryByTestId('home-bell-dot')).toBeNull();
    expect(screen.queryByText("Can't reach Autom8x")).toBeNull();
  });
});
