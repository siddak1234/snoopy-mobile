import React, { createContext, useContext, useMemo, useState } from 'react';

import { PLAN_BASE_PRICE } from '@/lib/fixtures';

/** One priced solution, however the screen sourced it. */
export type PricedSolution = { templateId: string; price: number; subscribed: boolean };

type SolutionsContextValue = {
  /** Whether a solution is on the plan, by templateId. */
  isActive: (templateId: string, fallback: boolean) => boolean;
  toggle: (templateId: string, current: boolean) => void;
  /** Totals for a supplied catalog; the provider holds only the overrides. */
  totals: (solutions: PricedSolution[]) => {
    activeCount: number;
    solutionsTotal: string;
    planTotal: string;
  };
};

const SolutionsContext = createContext<SolutionsContextValue | null>(null);

/**
 * Which solutions are on the plan, shared by the marketplace and Settings.
 *
 * This used to key `active` by the fixture's **array position** and compute its
 * totals from `solutionDefs`, which made it unusable against real data: a screen
 * rendering catalog entries against a position-keyed override would toggle the
 * wrong row, which is worse than the fixture it replaced. Identity is now the
 * `templateId`, the same identity the platform uses.
 *
 * The provider deliberately holds **only the overrides** and takes both the
 * price list and each solution's server-side `subscribed` from the caller. That
 * is what lets one hook serve a screen reading the live catalog and a screen
 * reading the prototype without it needing to know which.
 *
 * `PLAN_BASE_PRICE` is the one thing still imported from the fixtures, and it is
 * the reason this file cannot leave the ledger. The $99 plan base has no wire
 * source: BUILD-PLAN 8.3 records §12.1 #46 as ratified but says 8.3 "waits on
 * that account" — a payment provider account, which ADR-0016 places in Round 7.
 * So this is sequencing, not a missing endpoint.
 */
export function SolutionsProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const value = useMemo<SolutionsContextValue>(() => {
    const isActive = (templateId: string, fallback: boolean) =>
      overrides[templateId] ?? fallback;
    return {
      isActive,
      toggle: (templateId: string, current: boolean) =>
        setOverrides((prev) => ({ ...prev, [templateId]: !isActive(templateId, current) })),
      totals: (solutions: PricedSolution[]) => {
        const active = solutions.filter((s) => isActive(s.templateId, s.subscribed));
        const sum = active.reduce((acc, s) => acc + s.price, 0);
        return {
          activeCount: active.length,
          solutionsTotal: `$${sum}`,
          planTotal: `$${PLAN_BASE_PRICE + sum}`,
        };
      },
    };
  }, [overrides]);

  return <SolutionsContext.Provider value={value}>{children}</SolutionsContext.Provider>;
}

export function useSolutions(): SolutionsContextValue {
  const ctx = useContext(SolutionsContext);
  if (!ctx) throw new Error('useSolutions must be used inside SolutionsProvider');
  return ctx;
}
