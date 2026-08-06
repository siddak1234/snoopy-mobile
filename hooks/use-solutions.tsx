import React, { createContext, useContext, useMemo, useState } from 'react';

import { defaultActiveSolutions, PLAN_BASE_PRICE, solutionDefs } from '@/lib/fixtures';

type SolutionsContextValue = {
  /** Whether each solutionDefs index is on the plan. */
  active: Record<number, boolean>;
  toggle: (index: number) => void;
  activeCount: number;
  /** '$87' — monthly sum of active solutions. */
  solutionsTotal: string;
  /** '$186' — $99 base + active solutions (design planTotal). */
  planTotal: string;
};

const SolutionsContext = createContext<SolutionsContextValue | null>(null);

/** Cross-screen plan state: the Solutions marketplace toggles feed the plan
 *  totals shown on both Solutions and Settings (design DCLogic solOn). */
export function SolutionsProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(defaultActiveSolutions.map((i) => [i, true])),
  );

  const value = useMemo(() => {
    const sum = solutionDefs.reduce((acc, def, i) => acc + (active[i] ? def.price : 0), 0);
    const count = solutionDefs.filter((_, i) => active[i]).length;
    return {
      active,
      toggle: (index: number) => setActive((prev) => ({ ...prev, [index]: !prev[index] })),
      activeCount: count,
      solutionsTotal: `$${sum}`,
      planTotal: `$${PLAN_BASE_PRICE + sum}`,
    };
  }, [active]);

  return <SolutionsContext.Provider value={value}>{children}</SolutionsContext.Provider>;
}

export function useSolutions(): SolutionsContextValue {
  const ctx = useContext(SolutionsContext);
  if (!ctx) throw new Error('useSolutions must be used inside SolutionsProvider');
  return ctx;
}
