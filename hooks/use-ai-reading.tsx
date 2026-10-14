import { useCallback, useSyncExternalStore } from 'react';

import { useSession } from '@/hooks/use-session';
import { saveAiDocumentReading, type AiDocumentReadingChoice } from '@/lib/platform/ai-reading';

/**
 * The account's answer to "AI reads your documents" (backend ADR-0038): what
 * `GET /v1/session` says (`user.aiDocumentReading`, null while never asked),
 * or what this app saved since, whichever is newer.
 *
 * A save is said at once on every screen — Home's card, the run's gate and the
 * Settings switch read the one answer — and the session is read again behind
 * it, so the platform's own word follows. What was saved is kept here per
 * person, so another account signed in on this phone never reads it.
 */
const saved = new Map<string, AiDocumentReadingChoice>();
const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function remember(userId: string, choice: AiDocumentReadingChoice) {
  saved.set(userId, choice);
  version += 1;
  for (const listener of listeners) listener();
}

/** For tests: nothing saved by an earlier test answers the next. */
export function forgetSavedAiReading(): void {
  saved.clear();
  version += 1;
  for (const listener of listeners) listener();
}

export type AiReading = {
  /** `allowed`, `declined`, or null: never asked. */
  choice: AiDocumentReadingChoice | null;
  /** Whether a session is signed in: signed out, there is no account to ask. */
  signedIn: boolean;
  /** Saves the answer; throws when the platform refused it, saying nothing changed. */
  save: (choice: AiDocumentReadingChoice) => Promise<void>;
};

export function useAiReading(): AiReading {
  const session = useSession();
  const signedIn = session.status === 'signed-in';
  const userId = signedIn ? session.session.user.userId : null;
  const fromSession = signedIn ? (session.session.user.aiDocumentReading ?? null) : null;
  // The version, not the map: a save is a new snapshot for every reader.
  useSyncExternalStore(subscribe, () => version);
  const choice = (userId ? saved.get(userId) : undefined) ?? fromSession;
  const { reload } = session;

  const save = useCallback(
    async (next: AiDocumentReadingChoice) => {
      const answered = await saveAiDocumentReading(next);
      if (userId) remember(userId, answered.aiDocumentReading);
      // The platform's own word follows; an outage keeps what was just saved.
      void reload();
    },
    [userId, reload],
  );

  return { choice, signedIn, save };
}
