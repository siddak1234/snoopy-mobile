import { useCallback, useSyncExternalStore } from 'react';

import { useSession } from '@/hooks/use-session';
import { saveAiDocumentReading, type AiDocumentReadingChoice } from '@/lib/platform/ai-reading';

/**
 * The account's answer to "AI reads your documents" (backend ADR-0038): what
 * `GET /v1/session` says (`user.aiDocumentReading`, null while never asked),
 * or what this app saved since that session was read.
 *
 * A save is said at once on every screen — Home's card, the run's gate and the
 * Settings switch read the one answer — and the session is read again behind
 * it. What was saved stands in for the session read it was saved over, and
 * only for that one: the next read — the one behind the save, or any later
 * one, a sign-in included — is the platform's own word, so an answer changed
 * on the website or another device is followed here at the next read, never
 * held until the app restarts (the review of the Invoice Processing screens).
 * A read that fails keeps the session as it was, and so what was saved. It is
 * kept per person, so another account signed in on this phone never reads it.
 */
const saved = new Map<string, { choice: AiDocumentReadingChoice; over: object }>();
const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function remember(userId: string, choice: AiDocumentReadingChoice, over: object) {
  saved.set(userId, { choice, over });
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
  // The session read in hand: each read is a new one (`use-session.tsx`).
  const current = session.status === 'signed-in' ? session.session : null;
  const signedIn = current !== null;
  const userId = current?.user.userId ?? null;
  const fromSession = current?.user.aiDocumentReading ?? null;
  // The version, not the map: a save is a new snapshot for every reader.
  useSyncExternalStore(subscribe, () => version);
  const kept = userId ? saved.get(userId) : undefined;
  const choice = kept && kept.over === current ? kept.choice : fromSession;
  const { reload } = session;

  const save = useCallback(
    async (next: AiDocumentReadingChoice) => {
      const answered = await saveAiDocumentReading(next);
      if (userId && current) remember(userId, answered.aiDocumentReading, current);
      // The platform's own word follows; an outage keeps what was just saved.
      void reload();
    },
    [userId, current, reload],
  );

  return { choice, signedIn, save };
}
