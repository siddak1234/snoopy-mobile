/**
 * The visual audit's session store (round 24 A4): the real module
 * (`lib/platform/session-store.ts`), with a fixture session that expires in a
 * year, remembered, Face ID off — swapped in by `metro.config.js` only when
 * `VISUAL_AUDIT=1`, in a local Debug build, so the audited screens open signed
 * in without the owner's sign-in. No shipped code path changes; the fixture
 * Edge (`fixture-edge.mjs`) accepts any token.
 */
import type { StoredSession } from '../../lib/platform/session-store';

// Everything else is the real module's.
export {
  clearSession,
  readDeviceId,
  readPushNotNow,
  writeDeviceId,
  writeFaceIdEnabled,
  writePushNotNow,
  writeRememberSession,
  writeSession,
  type StoredSession,
} from '../../lib/platform/session-store';

const FIXTURE: StoredSession = {
  accessToken: 'visual-audit-access',
  refreshToken: 'visual-audit-refresh',
  expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
};

export async function readSession(): Promise<StoredSession | null> {
  return FIXTURE;
}

export async function readAccessToken(): Promise<string | null> {
  return FIXTURE.accessToken;
}

export async function readRememberSession(): Promise<boolean> {
  return true;
}

export async function readFaceIdEnabled(): Promise<boolean> {
  return false;
}

export async function readFaceIdChoice(): Promise<'on' | 'off' | 'unset'> {
  return 'off';
}
