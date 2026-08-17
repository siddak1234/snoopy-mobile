import * as SecureStore from 'expo-secure-store';

/**
 * The session credential, at rest.
 *
 * ADR-0017 amends invariant 1 to permit exactly this: a native client holds a
 * credential the platform issued, "held only in the operating system's secure
 * enclave (Keychain / Keystore), revocable server-side, and never written to
 * logs, analytics, backups, or a URL." Every rule in that sentence is a
 * constraint on this file, so:
 *
 * - values go to `expo-secure-store` and nowhere else — never AsyncStorage;
 * - no value is ever passed to a log call, an error message, or a route param;
 * - `keychainAccessible` is `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, which keeps the
 *   entry out of an iCloud or device-transfer backup. "Never written to
 *   backups" is that flag, not a comment.
 *
 * The three fields are stored under three keys rather than one JSON blob:
 * Android's keystore has a value-size ceiling that two JWTs in one string can
 * reach, and a partial read is easier to reason about than a truncated parse.
 */

const ACCESS_TOKEN_KEY = 'autom8x.access-token';
const REFRESH_TOKEN_KEY = 'autom8x.refresh-token';
const EXPIRES_AT_KEY = 'autom8x.access-expires-at';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds at which `accessToken` expires. */
  expiresAt: number;
};

export async function readSession(): Promise<StoredSession | null> {
  try {
    const [accessToken, refreshToken, expiresAt] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY, OPTIONS),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY, OPTIONS),
      SecureStore.getItemAsync(EXPIRES_AT_KEY, OPTIONS),
    ]);
    if (!accessToken || !refreshToken) return null;

    const parsed = Number(expiresAt);
    return {
      accessToken,
      refreshToken,
      // A missing or unreadable expiry is treated as already expired rather
      // than as forever: the refresh path is cheap and correct, and guessing
      // long would send a dead token on every request until the server said no.
      expiresAt: Number.isFinite(parsed) ? parsed : 0,
    };
  } catch {
    // An unreadable enclave is an unauthenticated app, not a crash.
    return null;
  }
}

/** The bearer credential, or null. Used by the transport facade on every call. */
export async function readAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY, OPTIONS);
  } catch {
    return null;
  }
}

export async function writeSession(session: StoredSession): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.accessToken, OPTIONS),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken, OPTIONS),
    SecureStore.setItemAsync(EXPIRES_AT_KEY, String(session.expiresAt), OPTIONS),
  ]);
}

export async function clearSession(): Promise<void> {
  await Promise.all(
    [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, EXPIRES_AT_KEY].map(async (key) => {
      try {
        await SecureStore.deleteItemAsync(key, OPTIONS);
      } catch {
        // Sign-out must complete locally even when the enclave is unavailable.
      }
    }),
  );
}
