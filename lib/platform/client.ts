import { backendApiOrigin } from './origin';
import {
  PlatformError,
  PlatformNotConfiguredError,
  PlatformUnreachableError,
  fallbackProblemTitle,
  publicProblem,
} from './problem';
import { readAccessToken } from './session-store';

/**
 * The app's only path to the network.
 *
 * Ported from `snoopy/lib/platform-server.ts`, minus the parts that are browser
 * shaped. Two differences matter:
 *
 * 1. **No `/api/platform` prefix.** That is a Next.js rewrite the website uses
 *    to keep its session cookie same-origin. A native client has no such
 *    rewrite and calls the Edge origin directly.
 * 2. **Bearer, not cookie.** `__Host-` cookies are browser-only. The Edge
 *    accepts `Authorization: Bearer` on every `/v1` route, so that is the native
 *    shape — once something can mint the credential (see `session-store.ts`).
 *
 * Every response type comes from `lib/generated/platform-contracts`. Callers
 * pass a generated type parameter; nothing here defines a wire shape.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

type PlatformRequest = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /**
   * Required by the Edge on most mutations — 16-128 chars, `[A-Za-z0-9._~:-]`.
   * Omitting it where the route demands one is a 400, not a silent success.
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export async function platformJson<T>(path: string, request: PlatformRequest = {}): Promise<T> {
  const origin = backendApiOrigin();
  if (!origin) throw new PlatformNotConfiguredError();

  const token = await readAccessToken();
  const { method = 'GET', body, idempotencyKey, signal } = request;

  // `AbortSignal.timeout` is deliberately not used. React Native polyfills
  // `AbortSignal` from `abort-controller@3`, which defines no statics at all, so
  // that call is `undefined` on a device — while Node, where the tests run, has
  // it. The failure would therefore be invisible in CI and total on device:
  // every request throwing before it was sent, reported as "unreachable".
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', abortFromCaller);
  }

  try {
    let response: Response;
    try {
      response = await fetch(`${origin}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          // React Native's HTTP stacks keep their own caches. Session-scoped
          // data must not be one of the things they hold.
          'cache-control': 'no-store',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch {
      // A DNS failure, a refused connection, and a timeout are the same thing
      // to a caller: the platform did not answer. It is still a 502, so every
      // `status === 502` rule holds, but the type says the request never landed
      // — which is how a screen tells "offline" from "the server refused".
      throw new PlatformUnreachableError();
    }

    const payload: unknown =
      response.status === 204 ? null : await response.json().catch(() => null);

    if (!response.ok) {
      const problem = publicProblem(payload);
      throw new PlatformError(
        problem.title ?? fallbackProblemTitle(response.status),
        response.status,
        problem.code,
        problem.details,
      );
    }
    return payload as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

/**
 * An idempotency key for one mutation.
 *
 * The backend requires 16-128 characters and treats the same key with different
 * input as a conflict rather than a replay, so this is per-attempt rather than
 * per-form: a user who edits and resubmits is making a new request, not
 * retrying the old one.
 */
export function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${randomId()}`.slice(0, 128);
}

/**
 * `crypto.randomUUID` is not present on every React Native runtime, and the key
 * only has to be unique per attempt, not unguessable.
 */
function randomId(): string {
  const now = Date.now().toString(36);
  const noise = Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 0xffffffff).toString(36),
  ).join('');
  return `${now}${noise}`;
}
