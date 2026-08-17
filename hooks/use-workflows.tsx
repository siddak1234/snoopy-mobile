import React, { createContext, useContext, useMemo, useState } from 'react';

import type { FlowStatus } from '@/lib/view/status';

export type { FlowStatus };

type WorkflowsContextValue = {
  /**
   * A workflow's status, with any local override applied.
   *
   * `fallback` is the server's own value, so the caller supplies identity AND
   * truth and this hook only remembers what the person changed since. Keyed by
   * `string` rather than the prototype's four-value `FlowKey`: a workspace has as
   * many workflows as it has subscriptions, and a subscription id is the identity
   * the platform actually uses.
   */
  status: (key: string, fallback: FlowStatus) => FlowStatus;
  /** Live ⇄ Paused; a Draft publishes to Live (design dToggle). */
  toggle: (key: string, current: FlowStatus) => void;
};

const WorkflowsContext = createContext<WorkflowsContextValue | null>(null);

/**
 * Workflow status, shared so the Flows list and the detail screen agree.
 *
 * This used to key by `FlowKey` and read its default from `lib/fixtures`, which
 * made it unusable against real data — four hardcoded keys cannot name a
 * workspace's subscriptions, and a screen rendering live rows against an
 * index-keyed override would have toggled the wrong workflow. It now holds only
 * the overrides and takes the server's status as the base.
 *
 * The override is optimistic and deliberately local: pausing a workflow is a
 * PATCH the screen owns, and this keeps the two screens agreeing between that
 * request and the next read.
 */
export function WorkflowsProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, FlowStatus>>({});

  const value = useMemo<WorkflowsContextValue>(() => {
    const status = (key: string, fallback: FlowStatus) => overrides[key] ?? fallback;
    return {
      status,
      toggle: (key: string, current: FlowStatus) =>
        setOverrides((prev) => ({
          ...prev,
          [key]: status(key, current) === 'Live' ? 'Paused' : 'Live',
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
