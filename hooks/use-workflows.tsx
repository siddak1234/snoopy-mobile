import React, { createContext, useContext, useMemo, useState } from 'react';

import { flowDefs, type FlowKey, type FlowStatus } from '@/lib/fixtures';

type WorkflowsContextValue = {
  /** Current status per workflow, overriding the fixture default (design flowSt). */
  status: (key: FlowKey) => FlowStatus;
  /** Live ⇄ Paused; a Draft publishes to Live (design dToggle). */
  toggle: (key: FlowKey) => void;
};

const WorkflowsContext = createContext<WorkflowsContextValue | null>(null);

/** Workflow status is shared so the Flows list and the detail screen agree. */
export function WorkflowsProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Partial<Record<FlowKey, FlowStatus>>>({});

  const value = useMemo(() => {
    const status = (key: FlowKey) => overrides[key] ?? flowDefs[key].status;
    return {
      status,
      toggle: (key: FlowKey) =>
        setOverrides((prev) => ({
          ...prev,
          [key]: status(key) === 'Live' ? 'Paused' : 'Live',
        })),
    };
  }, [overrides]);

  return <WorkflowsContext.Provider value={value}>{children}</WorkflowsContext.Provider>;
}

export function useWorkflows(): WorkflowsContextValue {
  const ctx = useContext(WorkflowsContext);
  if (!ctx) throw new Error('useWorkflows must be used inside WorkflowsProvider');
  return ctx;
}

/** Detail action per status (design dBtn / dBtnIcon). */
export function statusAction(status: FlowStatus): { label: string; icon: 'pause' | 'play' | 'rocket' } {
  if (status === 'Live') return { label: 'Pause', icon: 'pause' };
  if (status === 'Paused') return { label: 'Resume', icon: 'play' };
  return { label: 'Publish', icon: 'rocket' };
}
