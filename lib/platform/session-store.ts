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
const FACE_ID_ENABLED_KEY = 'autom8x.face-id-enabled';
/**
 * "Remember me", chosen at sign-in. Unset reads as remembered, so a session a
 * build before 2026-10-02 stored stays signed in. A session not remembered is
 * ended by the next cold start (`use-session`), never by a timer.
 */
const REMEMBER_SESSION_KEY = 'autom8x.remember-session';
/**
 * The id the platform answered when this phone registered for push (build 11,
 * D8; `PUT /v1/session/devices`) — never the push token, which travels once, in
 * that request's body. Kept beside the session and sent back on sign-out.
 */
const DEVICE_ID_KEY = 'autom8x.device-id';
/**
 * "Not now" said to the Notifications card. Held for the session, as the Face
 * ID offer's answer is: the card is not shown again until the next sign-in.
 */
const PUSH_NOT_NOW_KEY = 'autom8x.push-not-now';

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
  // The Face ID choice and "remember me" belong to the session they were made
  // for. The Keychain outlives a sign-out and even a reinstall, so leaving them
  // behind put a fresh OAuth sign-in through a Face ID prompt nobody had chosen
  // on this install (24.7.3 attempt 4). The push device's id and "Not now" are
  // the session's too (build 11, D8): the next person registers afresh and is
  // asked again.
  await Promise.all(
    [
      ACCESS_TOKEN_KEY,
      REFRESH_TOKEN_KEY,
      EXPIRES_AT_KEY,
      FACE_ID_ENABLED_KEY,
      REMEMBER_SESSION_KEY,
      DEVICE_ID_KEY,
      PUSH_NOT_NOW_KEY,
    ].map(async (key) => {
      try {
        await SecureStore.deleteItemAsync(key, OPTIONS);
      } catch {
        // Sign-out must complete locally even when the enclave is unavailable.
      }
    }),
  );
}

/** Device-local preference; it contains no identity or credential material. */
export async function readFaceIdEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(FACE_ID_ENABLED_KEY, OPTIONS)) === 'true';
  } catch {
    return false;
  }
}

export async function writeFaceIdEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(FACE_ID_ENABLED_KEY, String(enabled), OPTIONS);
}

/** Whether the Face ID question has been answered for this session: on, off, or never asked. */
export async function readFaceIdChoice(): Promise<'on' | 'off' | 'unset'> {
  try {
    const stored = await SecureStore.getItemAsync(FACE_ID_ENABLED_KEY, OPTIONS);
    return stored === 'true' ? 'on' : stored === 'false' ? 'off' : 'unset';
  } catch {
    return 'unset';
  }
}

export async function readRememberSession(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(REMEMBER_SESSION_KEY, OPTIONS)) !== 'false';
  } catch {
    return true;
  }
}

export async function writeRememberSession(remember: boolean): Promise<void> {
  await SecureStore.setItemAsync(REMEMBER_SESSION_KEY, String(remember), OPTIONS);
}

/** The id push registration answered, or null. Not a credential: it names the device, not the person. */
export async function readDeviceId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(DEVICE_ID_KEY, OPTIONS);
  } catch {
    return null;
  }
}

export async function writeDeviceId(deviceId: string): Promise<void> {
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId, OPTIONS);
}

/** Whether "Not now" was said to the Notifications card in this session. */
export async function readPushNotNow(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(PUSH_NOT_NOW_KEY, OPTIONS)) === 'true';
  } catch {
    return false;
  }
}

export async function writePushNotNow(): Promise<void> {
  await SecureStore.setItemAsync(PUSH_NOT_NOW_KEY, 'true', OPTIONS);
}
