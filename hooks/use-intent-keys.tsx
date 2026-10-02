import { useMemo, useRef } from 'react';

import { newIdempotencyKey } from '@/lib/platform/client';

/**
 * One idempotency key per intent, kept until that intent settles — BUILD-PLAN
 * 24.3.6.
 *
 * Every mutation the platform publishes takes an `Idempotency-Key`, and its
 * value is only as good as the client's discipline: a retry of the SAME
 * submission (a timeout, a lost answer) must reuse its key, so the platform
 * answers the first attempt instead of acting twice; a NEW intent after the
 * first succeeded must not. `scope` separates intents on different things — one
 * per subscription, say — so pausing two automations never shares a key.
 *
 * This is the pattern the Solutions screen (now `app/(tabs)/flows/add.tsx`) wrote by hand
 * (`pauseKeys`), named once for the screens Round 16 adds.
 */
export function useIntentKeys(prefix: string) {
  const keys = useRef<Record<string, string>>({});
  return useMemo(
    () => ({
      /** The key for this intent: the same one until it settles. */
      keyFor: (scope = '') => (keys.current[scope] ??= newIdempotencyKey(prefix)),
      /** The intent succeeded (or was abandoned): the next one gets a new key. */
      settle: (scope = '') => {
        delete keys.current[scope];
      },
    }),
    [prefix],
  );
}
