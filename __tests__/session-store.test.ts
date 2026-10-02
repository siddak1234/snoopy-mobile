jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';

import {
  clearSession,
  readFaceIdChoice,
  readFaceIdEnabled,
  readRememberSession,
  readSession,
  writeFaceIdEnabled,
  writeRememberSession,
  writeSession,
} from '@/lib/platform/session-store';

const options = { keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' };
const getItemAsync = SecureStore.getItemAsync as jest.Mock;
const setItemAsync = SecureStore.setItemAsync as jest.Mock;
const deleteItemAsync = SecureStore.deleteItemAsync as jest.Mock;

beforeEach(() => {
  getItemAsync.mockReset();
  setItemAsync.mockReset().mockResolvedValue(undefined);
  deleteItemAsync.mockReset().mockResolvedValue(undefined);
});

describe('secure session storage', () => {
  it('writes every credential this-device-only and only to SecureStore', async () => {
    await writeSession({ accessToken: 'access', refreshToken: 'refresh', expiresAt: 1234 });

    expect(setItemAsync.mock.calls).toEqual([
      ['autom8x.access-token', 'access', options],
      ['autom8x.refresh-token', 'refresh', options],
      ['autom8x.access-expires-at', '1234', options],
    ]);
  });

  it('refuses a partial credential and treats a malformed expiry as expired', async () => {
    getItemAsync
      .mockResolvedValueOnce('access')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('1234');
    await expect(readSession()).resolves.toBeNull();

    getItemAsync
      .mockResolvedValueOnce('access')
      .mockResolvedValueOnce('refresh')
      .mockResolvedValueOnce('not-a-number');
    await expect(readSession()).resolves.toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: 0,
    });
  });

  it('clears every credential locally even if one keychain deletion fails', async () => {
    deleteItemAsync.mockRejectedValueOnce(new Error('locked'));
    await expect(clearSession()).resolves.toBeUndefined();
    // Three credentials, and the two choices made at sign-in (2026-10-02).
    expect(deleteItemAsync).toHaveBeenCalledTimes(5);
    for (const call of deleteItemAsync.mock.calls) expect(call[1]).toEqual(options);
  });

  it('stores the Face ID preference without changing session credentials', async () => {
    await writeFaceIdEnabled(true);
    expect(setItemAsync).toHaveBeenCalledWith('autom8x.face-id-enabled', 'true', options);

    getItemAsync.mockResolvedValue('true');
    await expect(readFaceIdEnabled()).resolves.toBe(true);
    expect(getItemAsync).toHaveBeenCalledWith('autom8x.face-id-enabled', options);
  });
});

describe('the choices made at sign-in live and die with the session (24.7.3 attempt 4)', () => {
  it('sign-out clears the Face ID choice and "remember me" with the tokens', async () => {
    await clearSession();
    expect(deleteItemAsync.mock.calls.map(([key]) => key).sort()).toEqual(
      [
        'autom8x.access-expires-at',
        'autom8x.access-token',
        'autom8x.face-id-enabled',
        'autom8x.refresh-token',
        'autom8x.remember-session',
      ].sort(),
    );
  });

  it('reads the Face ID question as unanswered until it is answered either way', async () => {
    getItemAsync.mockResolvedValueOnce(null);
    expect(await readFaceIdChoice()).toBe('unset');
    getItemAsync.mockResolvedValueOnce('true');
    expect(await readFaceIdChoice()).toBe('on');
    getItemAsync.mockResolvedValueOnce('false');
    expect(await readFaceIdChoice()).toBe('off');
  });

  it('a session stored before the choice existed is remembered; only an explicit no is not', async () => {
    getItemAsync.mockResolvedValueOnce(null);
    expect(await readRememberSession()).toBe(true);
    getItemAsync.mockResolvedValueOnce('false');
    expect(await readRememberSession()).toBe(false);
    await writeRememberSession(false);
    expect(setItemAsync).toHaveBeenCalledWith('autom8x.remember-session', 'false', options);
  });
});
