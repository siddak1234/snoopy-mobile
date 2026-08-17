import React from 'react';
import { screen } from '@testing-library/react-native';

import BuilderScreen from '@/app/(tabs)/flows/builder';
import type { SessionContextValue } from '@/hooks/use-session';
import { toPipelineStep, toPipelineSteps, type DeclaredStep } from '@/lib/view/pipeline';
import { renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({ platformJson: jest.fn() }));
const { platformJson } = jest.requireMock('@/lib/platform/client');

/**
 * BUILD-PLAN 8.7 — the builder renders `manifest.pipeline`.
 *
 * Worth stating why this suite exists at all: until Round 6.6, `pipeline` was
 * published nowhere and 8.7 was not deliverable. These tests assert against the
 * shape it actually published, `AutomationDeclaredStep {id, kicker, title,
 * description}`, not against the prototype's step objects.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222';

const signedIn = {
  status: 'signed-in',
  session: {
    user: { userId: 'u1', email: 'd@e.com', activeWorkspaceId: WORKSPACE },
    workspaces: [{ id: WORKSPACE, name: 'Acme', role: 'owner' }],
  },
  refresh: () => {},
  signIn: async () => ({ status: 'unconfigured' as const, message: '' }),
  signOut: async () => ({ revoked: true }),
} as unknown as SessionContextValue;

const DECLARED: DeclaredStep[] = [
  { id: 'trigger', kicker: 'TRIGGER', title: 'New row in the ledger', description: 'Sheets' },
  { id: 'classify', kicker: 'AI STEP', title: 'Classify the entry', description: 'GL code' },
  { id: 'post', kicker: 'ACTION', title: 'Post to the ledger', description: 'QuickBooks' },
];

const CATALOG = {
  automations: [
    {
      templateId: 'acme.reconcile',
      version: 1,
      name: 'Ledger reconcile',
      description: 'd',
      category: 'Finance',
      icon: 'receipt',
      monthlyPriceUsd: 49,
      subscribed: true,
      available: true,
      setup: [],
      pipeline: DECLARED,
    },
  ],
  categories: ['All', 'Finance'],
};

afterEach(() => setMockParams({}));
beforeEach(() => platformJson.mockReset());

describe('toPipelineSteps', () => {
  it('keeps manifest order and maps description onto the design’s desc line', () => {
    const steps = toPipelineSteps(DECLARED);
    expect(steps.map((s) => s.title)).toEqual([
      'New row in the ledger',
      'Classify the entry',
      'Post to the ledger',
    ]);
    expect(steps[2].desc).toBe('QuickBooks');
  });

  it('sets `more` on every step but the last, because it draws the connector', () => {
    // The prototype's name suggests "summarises several actions"; both call sites
    // render a stem and plus-circle BETWEEN rows, so it is a position.
    expect(toPipelineSteps(DECLARED).map((s) => s.more)).toEqual([true, true, false]);
  });

  it('gives a single-step pipeline no connector', () => {
    expect(toPipelineSteps([DECLARED[0]]).map((s) => s.more)).toEqual([false]);
  });

  it('renders an unknown kicker rather than throwing', () => {
    // The enum is closed at [TRIGGER, AI STEP, ACTION]. `BRANCH` is the live
    // case: the design draws it and the contract cannot express it, so if it ever
    // arrives it must not crash the canvas.
    const branch: DeclaredStep = {
      id: 'b',
      kicker: 'BRANCH' as DeclaredStep['kicker'],
      title: 'Escalate if urgent',
      description: 'on-call',
    };
    expect(toPipelineStep(branch, true).icon).toBeTruthy();
    expect(toPipelineStep(branch, true).kicker).toBe('BRANCH');
  });

  it('treats an absent pipeline as empty rather than undefined', () => {
    expect(toPipelineSteps(undefined)).toEqual([]);
  });
});

describe('Builder canvas', () => {
  it('renders the named template’s declared steps', async () => {
    platformJson.mockResolvedValue(CATALOG);
    setMockParams({ template: 'acme.reconcile' });
    await renderWithProviders(<BuilderScreen />, signedIn);

    expect(await screen.findByText('New row in the ledger')).toBeTruthy();
    expect(screen.getByText('Post to the ledger')).toBeTruthy();
    // The prototype's steps are gone when a real pipeline resolved.
    expect(screen.queryByText('New email in AP inbox')).toBeNull();
  });

  it('falls back to the prototype when no template is named', async () => {
    // All three call sites push here with no argument today — the builder cannot
    // say which automation it is editing. Recorded as a finding, not invented.
    await renderWithProviders(<BuilderScreen />, signedIn);
    expect(await screen.findByText('New email in AP inbox')).toBeTruthy();
    expect(platformJson).not.toHaveBeenCalled();
  });
});
