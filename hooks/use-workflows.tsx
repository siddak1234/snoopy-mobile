import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { overrideScopeKey, useSession } from '@/hooks/use-session';
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
  /** The status the platform answered a change with, until the next read. */
  record: (key: string, answered: FlowStatus) => void;
  /** A read landed for these workflows: its answer replaces what was recorded. */
  settle: (keys: readonly string[]) => void;
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
 * The override is deliberately local: pausing a workflow is a PATCH the detail
 * screen owns, and this keeps the list agreeing with it between that request
 * and the list's next read. It is the platform's own answer (`record`), and it
 * lasts only until a read lands (`settle`): a status changed anywhere else —
 * Solutions' pause, a teammate on the website — must show when it is read, not
 * stay hidden behind what this device last changed.
 */
export function WorkflowsProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, FlowStatus>>({});

  // Subscription ids are workspace-scoped and this provider outlives a
  // sign-out, so the overrides are cleared whenever the person or the workspace
  // changes. See `overrideScopeKey` in hooks/use-session.tsx.
  const scope = overrideScopeKey(useSession());
  useEffect(() => {
    setOverrides({});
  }, [scope]);

  const record = useCallback((key: string, answered: FlowStatus) => {
    setOverrides((prev) => ({ ...prev, [key]: answered }));
  }, []);
  // Stable, so a screen can settle in an effect on its data without re-running
  // it — and clearing a fresh record — whenever an override changes.
  const settle = useCallback((keys: readonly string[]) => {
    setOverrides((prev) => {
      if (!keys.some((key) => key in prev)) return prev;
      const next = { ...prev };
      for (const key of keys) delete next[key];
      return next;
    });
  }, []);

  const value = useMemo<WorkflowsContextValue>(
    () => ({ status: (key, fallback) => overrides[key] ?? fallback, record, settle }),
    [overrides, record, settle],
  );

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
