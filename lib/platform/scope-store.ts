import * as SecureStore from 'expo-secure-store';

/**
 * The project a person chose to look at, per workspace, kept on the device
 * (BUILD-PLAN 24.9.2). It is a view preference, not tenancy: the workspace is
 * the thing authorized and lives in the backend session; the project only
 * narrows what Home, Flows and Activity show, and `null` is "All projects".
 *
 * The Keychain is the one store this app has (`session-store`); a preference
 * it cannot read or write is simply absent, never an error a screen shows.
 */
const PREFIX = 'autom8x.scope.';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function readScope(workspaceId: string): Promise<string | null> {
  try {
    const stored = await SecureStore.getItemAsync(`${PREFIX}${workspaceId}`, OPTIONS);
    return stored && stored.trim() ? stored : null;
  } catch {
    return null;
  }
}

export async function writeScope(workspaceId: string, projectId: string | null): Promise<void> {
  try {
    if (projectId) await SecureStore.setItemAsync(`${PREFIX}${workspaceId}`, projectId, OPTIONS);
    else await SecureStore.deleteItemAsync(`${PREFIX}${workspaceId}`, OPTIONS);
  } catch {
    // A choice that could not be kept is still the choice for this run.
  }
}
