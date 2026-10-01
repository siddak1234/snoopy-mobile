import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { activeWorkspaceId, useSession } from '@/hooks/use-session';
import {
  PlatformError,
  PlatformNotConfiguredError,
  PlatformRateLimitedError,
  PlatformUnreachableError,
} from '@/lib/platform/problem';

/**
 * One read, in the four states the design draws.
 *
 * Screens used to read `lib/fixtures` synchronously, so they had nothing to be
 * in a state *about*. This is the missing half: it turns one request into the
 * exact vocabulary `Screen.dc.html` renders, and nothing more. It deliberately
 * does not cache, dedupe, or poll — a screen reads when it mounts, when the
 * person asks it to again, and when it regains focus.
 *
 * **Returning to a screen re-reads it and keeps the rows in place**
 * (ROUND-7.5-OBSERVATIONS finding 1, BUILD-PLAN 24.4.4). A tab stays mounted, so
 * without a re-read on focus it showed what it read at mount until the app was
 * relaunched. That re-read of the SAME request keeps what is on screen — no
 * skeleton — and replaces it only with what the platform answers; one that
 * fails leaves it in place, because nothing the person was reading is destroyed
 * to report an error.
 *
 * **`reload()` is different, and starts from `loading`.** A screen calls it
 * after it changed something, or from Retry: the rows on screen are then known
 * to be out of date, so they are not left to act on — a dialog would re-seed
 * from them and a save would undo the one before — and a reload that fails
 * says so. A CHANGED request (another workspace) also starts from `loading`:
 * keeping the previous request's rows would show one workspace's data under
 * another's name.
 *
 * The states are not interchangeable, and the difference is observable:
 *
 * - `offline` is a request that never landed (`PlatformUnreachableError`). The
 *   design shows "You're offline", because nothing is wrong with the platform.
 * - `error` is a platform that answered and refused. The design names the thing
 *   that failed to load and offers Retry.
 * - `unconfigured` means no request can be made: the build has no backend or a
 *   workspace-scoped read has no resolved workspace. Screens render a refusal;
 *   they never substitute prototype data.
 * - `error` with `busy` is a 429: the platform asked to be left a while
 *   (backend §12.1 #114, BUILD-PLAN 24.3.3). The failed-load state then says
 *   the wait in words (`busyBody`) instead of the generic body, as the web's
 *   busy panel does — never "signed out".
 * - `401` is not handled here. It is the session's business, and
 *   `hooks/use-session.tsx` owns the route guard that answers it.
 */
export type ResourceState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string; busy?: true }
  | { status: 'offline' }
  | { status: 'unconfigured' };

/**
 * `reload()` starts from `loading`; `refresh()` re-reads the SAME request keeping
 * the rows, exactly as a return to the screen does. A screen uses `refresh()`
 * after a change whose answer is already on screen — a status it `record`ed —
 * because replacing a workflow's page with a skeleton to confirm the status it
 * just showed reads as the screen going blank (24.7.3 attempt 1, feedback #6).
 */
export type Resource<T> = ResourceState<T> & { reload: () => void; refresh: () => void };

export function useResource<T>(read: () => Promise<T>, deps: unknown[] = []): Resource<T> {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Whether the next read is a return to this screen, which keeps the rows.
  const returning = useRef(false);

  const reload = useCallback(() => {
    returning.current = false;
    setAttempt((n) => n + 1);
  }, []);
  const refresh = useCallback(() => {
    returning.current = true;
    setAttempt((n) => n + 1);
  }, []);

  // `read` is intentionally not a dependency: callers write it inline, so a new
  // identity every render would fetch forever. `deps` is the caller's statement
  // of what actually changes the request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const readRef = useCallback(read, deps);
  const lastRead = useRef(readRef);

  // The first focus is the mount's own read; every later one is a return to
  // this screen, and re-reads it.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) refresh();
      else focusedOnce.current = true;
    }, [refresh]),
  );

  useEffect(() => {
    let cancelled = false;
    const keepRows = lastRead.current === readRef && returning.current;
    lastRead.current = readRef;
    returning.current = false;
    const keep = (next: ResourceState<T>) => (previous: ResourceState<T>) =>
      keepRows && previous.status === 'ready' ? previous : next;
    setState(keep({ status: 'loading' }));

    // `Promise.resolve().then(...)` rather than `readRef()` directly: a reader
    // that throws SYNCHRONOUSLY would otherwise escape the chain entirely and
    // surface as a render error instead of a state. `useWorkspaceResource` does
    // exactly that when no workspace has resolved. Converting it to a state is
    // the difference between a controlled refusal and a render crash.
    Promise.resolve()
      .then(() => readRef())
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof PlatformNotConfiguredError) {
          setState(keep({ status: 'unconfigured' }));
        } else if (error instanceof PlatformUnreachableError) {
          setState(keep({ status: 'offline' }));
        } else if (error instanceof PlatformRateLimitedError) {
          setState(keep({ status: 'error', message: error.message, busy: true }));
        } else if (error instanceof PlatformError) {
          setState(keep({ status: 'error', message: error.message }));
        } else {
          setState(
            keep({
              status: 'error',
              message: error instanceof Error ? error.message : 'Something went wrong.',
            }),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [readRef, attempt]);

  return { ...state, reload, refresh };
}

/** A failed load's words when it was a 429 — the wait it stated — else none. */
export function busyBody(state: ResourceState<unknown>): string | undefined {
  return state.status === 'error' && state.busy ? state.message : undefined;
}

/**
 * A read scoped to the workspace whose data the screens show.
 *
 * Every product path is workspace-scoped — the workspace is in the URL because
 * it is the thing being authorized — so four screens would otherwise repeat the
 * same three lines of session plumbing.
 *
 * With no resolvable workspace the read never fires and the state is
 * `unconfigured` rather than an error. That is not permission to render a
 * fallback workspace: the protected layout fails closed while session state is
 * unresolved, and direct screen renders show the controlled error treatment.
 */
export function useWorkspaceResource<T>(
  read: (workspaceId: string) => Promise<T>,
  deps: unknown[] = [],
): Resource<T> & { loadedFor: string | null } {
  const session = useSession();
  const workspaceId = activeWorkspaceId(session);
  // The workspace the data on screen was read for — what an action binds to
  // (`workspaceIfShown`, BUILD-PLAN 24.3.6). Set in the read's own chain, so it
  // is current before `useResource` renders the data it belongs to, and only by
  // the LATEST read: `useResource` renders only that one, so an older read that
  // finishes later must not re-label the data on screen with its workspace.
  const loaded = useRef<string | null>(null);
  const latest = useRef(0);

  const resource = useResource<T>(() => {
    if (!workspaceId) throw new PlatformNotConfiguredError();
    const request = ++latest.current;
    return read(workspaceId).then((data) => {
      if (request === latest.current) loaded.current = workspaceId;
      return data;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, ...deps]);

  return { ...resource, loadedFor: resource.status === 'ready' ? loaded.current : null };
}
