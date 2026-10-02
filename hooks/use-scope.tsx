import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { activeWorkspaceId, useSession } from '@/hooks/use-session';
import { readScope, writeScope } from '@/lib/platform/scope-store';

/**
 * The scope the person is looking at: the active workspace (the session's,
 * never chosen here) and, within it, one project or all of them (BUILD-PLAN
 * 24.9.2, the owner's feedback 2 of 2026-10-02).
 *
 * Home, Flows and Activity follow it. Projects are a visibility scope on a
 * subscription (`projectId`, backend 18.6.2); runs and approvals carry no
 * project of their own and follow their flow's. The choice is kept per
 * workspace on the device and restored with it, so a workspace switch shows
 * the project last looked at there, or everything.
 */
export type ScopeContextValue = {
  /** The chosen project's id, or `null` for every project. */
  projectId: string | null;
  setProjectId: (projectId: string | null) => void;
};

const ScopeContext = createContext<ScopeContextValue | null>(null);

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const workspaceId = activeWorkspaceId(session);
  const [chosen, setChosen] = useState<{ workspaceId: string | null; projectId: string | null }>({
    workspaceId: null,
    projectId: null,
  });

  // The stored choice for THIS workspace, read when it becomes active. Until it
  // lands the scope is "all", which is also what a workspace with no stored
  // choice shows; a read for a workspace no longer active is dropped.
  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) {
      setChosen({ workspaceId: null, projectId: null });
      return;
    }
    readScope(workspaceId).then((projectId) => {
      if (!cancelled) setChosen({ workspaceId, projectId });
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const setProjectId = useCallback(
    (projectId: string | null) => {
      if (!workspaceId) return;
      setChosen({ workspaceId, projectId });
      void writeScope(workspaceId, projectId);
    },
    [workspaceId],
  );

  const value = useMemo<ScopeContextValue>(
    () => ({
      projectId: chosen.workspaceId === workspaceId ? chosen.projectId : null,
      setProjectId,
    }),
    [chosen, workspaceId, setProjectId],
  );

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

/** The scope, or "all projects" where no provider is mounted (a screen rendered alone). */
export function useScope(): ScopeContextValue {
  const ctx = useContext(ScopeContext);
  return ctx ?? { projectId: null, setProjectId: () => undefined };
}
