/**
 * One workspace snapshot, shared by every screen (BUILD-PLAN 24.9.1).
 *
 * Until 2026-10-02 each screen read its own three to five resources on mount,
 * again on every return to the tab, and shared nothing: ten screens read the
 * same catalog, seven the same subscriptions. One phone made 65 and 77 requests
 * in a minute, and each request costs the platform an identity check, a hop to
 * the Access service and a rate-limit write before the real work — the burst
 * that refused the pooler its connections (backend §12.1 #199).
 *
 * This is the shared layer. A read is keyed by workspace and resource:
 *
 * - **One in-flight request per key.** Two screens mounting together share the
 *   answer instead of asking twice.
 * - **A window of freshness per resource.** A return to a screen re-validates
 *   only what is older than its window — short for what runs change (runs,
 *   approvals, subscriptions, counts, connections), longer for what an
 *   administrator changes (the catalog, projects, providers, workspaces).
 * - **An action invalidates what it changed, and only that.** A Pause drops
 *   the subscriptions; a decision drops approvals and runs; a `reload()` drops
 *   the whole workspace. The next read is then a real request.
 *
 * What it is not: a cache that outlives a failure (a refused read is dropped,
 * so Retry asks again), or a store of its own (screens still read through the
 * `lib/platform` functions, which answer from here when they can). The website
 * reads per navigation and caches nothing on the client; the windows below are
 * a deliberate mobile difference, recorded in DESIGN-CONTRACT.
 */

type Entry = { promise: Promise<unknown>; readAt: number | null };

/** How long an answer serves a return to a screen before it is read again. */
export const SNAPSHOT_WINDOW_MS = {
  /** What a run, a decision or a connection changes. */
  volatile: 15_000,
  /** What an administrator changes: the catalog, projects, providers, workspaces. */
  settled: 120_000,
} as const;
export type SnapshotWindow = keyof typeof SNAPSHOT_WINDOW_MS;

/** The scope of a read that is not a workspace's: providers, workspaces. */
export const GLOBAL_SCOPE = '';

const entries = new Map<string, Entry>();
const SEPARATOR = '\u0000';
const idOf = (scope: string, key: string) => `${scope}${SEPARATOR}${key}`;

/**
 * The answer for `key` in `scope`: the in-flight one, the fresh one, or a new
 * read. A read that fails is not kept, so the next caller asks again.
 */
export function shared<T>(
  scope: string,
  key: string,
  window: SnapshotWindow,
  read: () => Promise<T>,
): Promise<T> {
  const id = idOf(scope, key);
  const existing = entries.get(id);
  if (existing) {
    const inFlight = existing.readAt === null;
    const fresh = existing.readAt !== null && Date.now() - existing.readAt < SNAPSHOT_WINDOW_MS[window];
    if (inFlight || fresh) return existing.promise as Promise<T>;
  }
  const entry: Entry = { promise: Promise.resolve(), readAt: null };
  entry.promise = read().then(
    (data) => {
      entry.readAt = Date.now();
      return data;
    },
    (error: unknown) => {
      if (entries.get(id) === entry) entries.delete(id);
      throw error;
    },
  );
  entries.set(id, entry);
  return entry.promise as Promise<T>;
}

/**
 * Drop what an action changed: the named keys (a key names its sub-keys too —
 * `runs` drops `runs:<subscription>`), or everything in the scope when no keys
 * are named.
 */
export function invalidateShared(scope: string, keys?: readonly string[]): void {
  for (const id of [...entries.keys()]) {
    const [entryScope, key] = id.split(SEPARATOR) as [string, string];
    if (entryScope !== scope) continue;
    if (!keys || keys.some((named) => key === named || key.startsWith(`${named}:`))) entries.delete(id);
  }
}

/** Everything, every scope — a session ending or beginning (`hooks/use-session.tsx`), and each test's start. */
export function resetSnapshot(): void {
  entries.clear();
}
