import Constants from 'expo-constants';

/**
 * Parse the only backend location the app is allowed to know.
 *
 * Ported from `snoopy/lib/backend-origin.ts` so both clients reject the same
 * malformed values. The one deliberate difference is the cleartext rule: the
 * website carves out the private Compose DNS name `http://api:8080`, which a
 * device cannot reach. A native build instead allows cleartext only in
 * development, where the Edge is a simulator-visible `localhost:8080` or
 * `10.0.2.2:8080`.
 */
export function backendApiOrigin(): string | null {
  const extra = Constants.expoConfig?.extra?.backendApiOrigin;
  const configured = typeof extra === 'string' ? extra.trim() : '';
  if (!configured) return null;

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('backendApiOrigin must be an absolute URL');
  }
  // Scheme first: a non-HTTP URL fails the shape checks below for incidental
  // reasons, and "must use HTTP or HTTPS" is the accurate diagnosis.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('backendApiOrigin must use HTTP or HTTPS');
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== '/'
  ) {
    throw new Error('backendApiOrigin must contain only an origin');
  }
  // A shipped build talks to a real Edge over TLS. Cleartext is a development
  // affordance for the local Compose stack, never something a release can do.
  if (!__DEV__ && parsed.protocol !== 'https:') {
    throw new Error('backendApiOrigin must use HTTPS outside development');
  }
  return parsed.origin;
}
