import * as SecureStore from 'expo-secure-store';

import { AI_CONSENT_VERSION } from '@/lib/content/ai-consent';

/**
 * Whether a person agreed, on this phone, to AI reading the file a run is given
 * (`lib/content/ai-consent.ts`; Apple's Guideline 5.1.2(i)). Kept as the
 * appearance is (`appearance-store`), in the Keychain, this-device-only, under a
 * key naming the consent's version and the person — the session's user id — so
 * another person on this phone, or a new version of the words, is asked again.
 *
 * Never assumed: a consent the Keychain cannot read is none, and the person is
 * asked. One it cannot keep still starts the run it was given for, and the next
 * run asks again. It is the person's on this phone, not the session's, so a
 * sign-out leaves it.
 */
const PREFIX = 'autom8x.ai-consent';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** What is kept: that the person agreed. The key says to what, and who. */
const AGREED = 'agreed';

export function aiConsentKey(userId: string, version: number = AI_CONSENT_VERSION): string {
  return `${PREFIX}.v${version}.${userId}`;
}

export async function readAiConsent(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    return (await SecureStore.getItemAsync(aiConsentKey(userId), OPTIONS)) === AGREED;
  } catch {
    return false;
  }
}

export async function writeAiConsent(userId: string | null): Promise<void> {
  if (!userId) return;
  try {
    await SecureStore.setItemAsync(aiConsentKey(userId), AGREED, OPTIONS);
  } catch {
    // Not kept: the run it was given for starts all the same, and the next one asks again.
  }
}
