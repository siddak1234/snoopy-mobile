import {
  GLOBAL_SCOPE,
  SNAPSHOT_WINDOW_MS,
  invalidateShared,
  resetSnapshot,
  shared,
} from '@/lib/platform/snapshot';

/**
 * The shared workspace snapshot (BUILD-PLAN 24.9.1): one request per resource
 * in flight, a window of freshness on a return, and an action dropping only
 * what it changed.
 */
describe('the shared workspace snapshot', () => {
  beforeEach(() => {
    jest.useRealTimers();
    resetSnapshot();
  });

  it('answers two readers of one resource with one request', async () => {
    const read = jest.fn(async () => ({ rows: [1] }));
    const [a, b] = await Promise.all([
      shared('ws-1', 'subscriptions', 'volatile', read),
      shared('ws-1', 'subscriptions', 'volatile', read),
    ]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('serves a return within the window from the answer, and reads again after it', async () => {
    jest.useFakeTimers({ now: 1_000_000 });
    const read = jest.fn(async () => 'first');
    await shared('ws-1', 'runs', 'volatile', read);
    jest.setSystemTime(1_000_000 + SNAPSHOT_WINDOW_MS.volatile - 1);
    await expect(shared('ws-1', 'runs', 'volatile', read)).resolves.toBe('first');
    expect(read).toHaveBeenCalledTimes(1);
    jest.setSystemTime(1_000_000 + SNAPSHOT_WINDOW_MS.volatile + 1);
    read.mockResolvedValueOnce('second');
    await expect(shared('ws-1', 'runs', 'volatile', read)).resolves.toBe('second');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('keeps workspaces apart, and a global scope apart from both', async () => {
    const read = jest.fn(async () => 'x');
    await shared('ws-1', 'catalog', 'settled', read);
    await shared('ws-2', 'catalog', 'settled', read);
    await shared(GLOBAL_SCOPE, 'providers', 'settled', read);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('drops only what an action names, sub-keys included, and everything when nothing is named', async () => {
    const read = jest.fn(async () => 'x');
    await shared('ws-1', 'runs', 'volatile', read);
    await shared('ws-1', 'runs:sub-9', 'volatile', read);
    await shared('ws-1', 'catalog', 'settled', read);
    invalidateShared('ws-1', ['runs']);
    await shared('ws-1', 'runs', 'volatile', read);
    await shared('ws-1', 'runs:sub-9', 'volatile', read);
    await shared('ws-1', 'catalog', 'settled', read);
    expect(read).toHaveBeenCalledTimes(5);
    invalidateShared('ws-1');
    await shared('ws-1', 'catalog', 'settled', read);
    expect(read).toHaveBeenCalledTimes(6);
  });

  it('does not keep a refusal, so Retry asks again', async () => {
    const read = jest.fn().mockRejectedValueOnce(new Error('refused')).mockResolvedValueOnce('ok');
    await expect(shared('ws-1', 'approvals', 'volatile', read)).rejects.toThrow('refused');
    await expect(shared('ws-1', 'approvals', 'volatile', read)).resolves.toBe('ok');
    expect(read).toHaveBeenCalledTimes(2);
  });
});
