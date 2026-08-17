import { useCallback, useEffect, useState } from 'react';

import {
  PlatformError,
  PlatformNotConfiguredError,
  PlatformUnreachableError,
} from '@/lib/platform/problem';

/**
 * One read, in the four states the design draws.
 *
 * Screens used to read `lib/fixtures` synchronously, so they had nothing to be
 * in a state *about*. This is the missing half: it turns one request into the
 * exact vocabulary `Screen.dc.html` renders, and nothing more. It deliberately
 * does not cache, dedupe, or poll — a screen reads when it mounts and when the
 * person asks it to again, which is all the design describes.
 *
 * The states are not interchangeable, and the difference is observable:
 *
 * - `offline` is a request that never landed (`PlatformUnreachableError`). The
 *   design shows "You're offline", because nothing is wrong with the platform.
 * - `error` is a platform that answered and refused. The design names the thing
 *   that failed to load and offers Retry.
 * - `unconfigured` is a build with no backend origin at all. That is the design
 *   prototype's normal state, and it must stay browsable rather than showing a
 *   failure — the UI is the asset this round exists to preserve, so screens fall
 *   back to their prototype content instead of locking.
 * - `401` is not handled here. It is the session's business, and
 *   `hooks/use-session.tsx` owns the route guard that answers it.
 */
export type ResourceState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string }
  | { status: 'offline' }
  | { status: 'unconfigured' };

export type Resource<T> = ResourceState<T> & { reload: () => void };

export function useResource<T>(read: () => Promise<T>, deps: unknown[] = []): Resource<T> {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // `read` is intentionally not a dependency: callers write it inline, so a new
  // identity every render would fetch forever. `deps` is the caller's statement
  // of what actually changes the request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const readRef = useCallback(read, deps);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    readRef()
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof PlatformNotConfiguredError) {
          setState({ status: 'unconfigured' });
        } else if (error instanceof PlatformUnreachableError) {
          setState({ status: 'offline' });
        } else if (error instanceof PlatformError) {
          setState({ status: 'error', message: error.message });
        } else {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Something went wrong.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [readRef, attempt]);

  return { ...state, reload };
}
