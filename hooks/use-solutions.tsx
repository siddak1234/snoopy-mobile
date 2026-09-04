import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { overrideScopeKey, useSession } from '@/hooks/use-session';

/** One priced solution, however the screen sourced it. */
export type PricedSolution = { templateId: string; price: number; subscribed: boolean };

type SolutionsContextValue = {
  /** Whether a solution is on the plan, by templateId. */
  isActive: (templateId: string, fallback: boolean) => boolean;
  toggle: (templateId: string, current: boolean) => void;
  /**
   * State a solution's plan membership after a mutation the platform accepted.
   *
   * `toggle` flips relative to the effective state, which is the right shape
   * for one control and the wrong one for a mutation whose outcome is known:
   * after `PATCH … status: live` succeeds the answer is "on", whatever a
   * previous override said. Found live on 2026-09-03: a pause set the
   * override to false, the later Activate never set it back, and Settings
   * counted "0 active" against a subscription the database showed as live.
   */
  setActive: (templateId: string, active: boolean) => void;
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
 * lets the marketplace and Settings share a successful mutation immediately
 * without making this provider a second catalog.
 *
 * **There is no plan base, and that is the answer rather than a gap.** This file
 * used to add a $99 `PLAN_BASE_PRICE` from the fixtures, recorded as waiting on
 * Round 7's payment provider account. The backend answered on 2026-08-17 that the
 * reason was wrong twice over: publishing a price needs no provider account —
 * `AutomationCatalogEntry.monthlyPriceUsd` is already required and already
 * published — and, more to the point, there is no plan to price.
 * `entitlements.plans` has no price column at all, only a nullable
 * `provider_price_id` pointer, and only `free` is seeded, with none. The plan a
 * real workspace is on has a base of **$0**.
 *
 * So the total is the solutions total, and no local constant stands in for the
 * missing one. Inventing a `$99` here would be exactly the shape the round
 * forbids a client to invent: a price the platform has not stated.
 */
export function SolutionsProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  /**
   * An override belongs to one person in one workspace, and to nothing else.
   *
   * This provider is mounted above the route tree, so it survives sign-out:
   * without this, the overrides one account accumulated would still be layered
   * over the next account's catalog in the same app process, and a workspace
   * switch would apply one tenant's local state to another's templateIds. The
   * scope key changes on sign-out, sign-in, and workspace switch alike, so one
   * effect covers all three.
   */
  const scope = overrideScopeKey(useSession());
  useEffect(() => {
    setOverrides({});
  }, [scope]);

  const value = useMemo<SolutionsContextValue>(() => {
    const isActive = (templateId: string, fallback: boolean) =>
      overrides[templateId] ?? fallback;
    return {
      isActive,
      toggle: (templateId: string, current: boolean) =>
        setOverrides((prev) => ({ ...prev, [templateId]: !isActive(templateId, current) })),
      setActive: (templateId: string, active: boolean) =>
        setOverrides((prev) => ({ ...prev, [templateId]: active })),
      totals: (solutions: PricedSolution[]) => {
        const active = solutions.filter((s) => isActive(s.templateId, s.subscribed));
        const sum = active.reduce((acc, s) => acc + s.price, 0);
        return {
          activeCount: active.length,
          solutionsTotal: `$${sum}`,
          // No base term. See the note above: there is no plan to price.
          planTotal: `$${sum}`,
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
