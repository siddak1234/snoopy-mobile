import * as SecureStore from 'expo-secure-store';

/**
 * The appearance a person chose — Auto, Dark or Light (Settings › Appearance) —
 * kept on the device, so a cold launch opens in it (Gate 24 parity, G2). The
 * website keeps its theme the same way, in the browser (`localStorage`
 * "theme"), and applies it before first paint; until Gate 24 every cold launch
 * here returned to Dark.
 *
 * A view preference of the device, not of a person or a session: it is not
 * cleared at sign-out, as the website's is not. The Keychain is the one store
 * this app has (`scope-store`); a preference it cannot read is Dark, the
 * design's default, and one it cannot write is still the choice for this run.
 */
const APPEARANCE_KEY = 'autom8x.appearance';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const APPEARANCES = ['auto', 'dark', 'light'] as const;
export type Appearance = (typeof APPEARANCES)[number];

export async function readAppearance(): Promise<Appearance> {
  try {
    const stored = await SecureStore.getItemAsync(APPEARANCE_KEY, OPTIONS);
    return APPEARANCES.find((appearance) => appearance === stored) ?? 'dark';
  } catch {
    return 'dark';
  }
}

export async function writeAppearance(appearance: Appearance): Promise<void> {
  try {
    await SecureStore.setItemAsync(APPEARANCE_KEY, appearance, OPTIONS);
  } catch {
    // A choice that could not be kept is still the choice for this run.
  }
}
