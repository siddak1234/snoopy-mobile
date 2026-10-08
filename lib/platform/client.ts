import createClient, { type Client, type Middleware } from 'openapi-fetch';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';

import type { paths as AutomationPaths } from '@/lib/generated/platform-contracts/automations';
import type { paths as ConnectionPaths } from '@/lib/generated/platform-contracts/connections';
import type { paths as PlatformPaths } from '@/lib/generated/platform-contracts/platform';
import { backendApiOrigin } from './origin';
import {
  PlatformError,
  PlatformNotConfiguredError,
  PlatformRateLimitedError,
  PlatformUnreachableError,
  fallbackProblemTitle,
  publicProblem,
} from './problem';
import { busyMessage, retryAfterSeconds } from './retry-after';
import { recoverSession } from './session-recovery';
import { readAccessToken } from './session-store';

/**
 * The app's generated OpenAPI clients.
 *
 * `openapi-fetch` supplies the runtime transport and each client is parameterised
 * by one of the declarations generated from the backend's three public specs.
 * Repository code therefore never constructs or sends a hand-written fetch.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

export type PlatformClients = {
  platform: Client<PlatformPaths>;
  automations: Client<AutomationPaths>;
  connections: Client<ConnectionPaths>;
};

type OpenApiResult<T> = {
  data?: T;
  error?: unknown;
  response: Response;
};

let cachedOrigin: string | null = null;
let cachedClients: PlatformClients | null = null;

const sessionMiddleware: Middleware = {
  async onRequest({ request }) {
    request.headers.set('cache-control', 'no-store');
    const token = await readAccessToken();
    if (token) request.headers.set('authorization', `Bearer ${token}`);
    return request;
  },
};

function createClients(origin: string): PlatformClients {
  const platform = createClient<PlatformPaths>({ baseUrl: origin });
  const automations = createClient<AutomationPaths>({ baseUrl: origin });
  const connections = createClient<ConnectionPaths>({ baseUrl: origin });
  platform.use(sessionMiddleware);
  automations.use(sessionMiddleware);
  connections.use(sessionMiddleware);
  return { platform, automations, connections };
}

function clientsForConfiguredOrigin(): PlatformClients {
  const origin = backendApiOrigin();
  if (!origin) throw new PlatformNotConfiguredError();
  if (!cachedClients || cachedOrigin !== origin) {
    cachedOrigin = origin;
    cachedClients = createClients(origin);
  }
  return cachedClients;
}

/**
 * The three routes that mint or destroy a credential.
 *
 * They are exempt from the 401 retry below, and the exemption is load-bearing
 * rather than tidiness: `/v1/auth/native/refresh` answering 401 is exactly how
 * the platform says a refresh token is dead, so retrying it after a refresh
 * would ask the dead token to renew itself, forever. The other two carry no
 * bearer worth renewing.
 */
const CREDENTIAL_ROUTES = ['/v1/auth/native/token', '/v1/auth/native/refresh', '/v1/auth/logout'];

/**
 * Run one schema-typed operation and project its error into the shared client
 * vocabulary. `operationKey` is the concrete public path and gives tests one
 * stable seam without replacing the generated request itself.
 *
 * A 401 on any non-credential route is renewed once and retried once. Before
 * this, an access token that expired while the app was open produced a 401 that
 * nothing handled: `hooks/use-resource.tsx` turned it into an error state and
 * `hooks/use-session.tsx` only ever refreshed at mount, so every screen showed
 * "Sign in is required" until the app was killed. Renewal belongs here because
 * this is the one place every request passes through; doing it per screen would
 * be the same rule written fifteen times.
 */
export async function platformOperation<T>(
  operationKey: string,
  execute: (clients: PlatformClients, signal: AbortSignal) => Promise<OpenApiResult<T>>,
): Promise<T> {
  if (!operationKey) throw new Error('A platform operation key is required');
  const renewable = !CREDENTIAL_ROUTES.some((route) => operationKey.startsWith(route));
  try {
    return await sendOnce(execute);
  } catch (error) {
    if (!renewable || !(error instanceof PlatformError) || error.status !== 401) throw error;
    // Only a 401 reaches here, and only 401 proves the credential dead. An
    // outage is a 502 and never gets this far, so an unreachable platform can
    // never cost a person their session.
    const renewal = await recoverSession();
    if (renewal.status === 'renewed') return await sendOnce(execute);
    // A renewal the platform could not make — a 429 with its wait, an outage —
    // says nothing about the credential: the caller hears that refusal, never
    // the 401 it would read as a sign-out (24.3.3; Gate 24's security review,
    // which found a 429 on the refresh route clearing the keychain this way).
    if (renewal.status === 'unavailable') throw renewal.cause;
    throw error;
  }
}

/** One attempt: build the request, bound it, and map its refusal. */
async function sendOnce<T>(
  execute: (clients: PlatformClients, signal: AbortSignal) => Promise<OpenApiResult<T>>,
): Promise<T> {
  // Read before the async boundary so an unconfigured build fails as
  // `PlatformNotConfiguredError`, not as an apparent network outage.
  const clients = clientsForConfiguredOrigin();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    let result: OpenApiResult<T>;
    try {
      result = await execute(clients, controller.signal);
    } catch (error) {
      if (
        error instanceof PlatformError ||
        error instanceof PlatformNotConfiguredError ||
        error instanceof PlatformUnreachableError
      ) {
        throw error;
      }
      throw new PlatformUnreachableError();
    }

    if (!result.response.ok) {
      const problem = publicProblem(result.error);
      // A 429 is the platform asking to be left for a while — backend §12.1
      // #114, BUILD-PLAN 24.3.3. It is said in words with the wait it stated,
      // here, once, so no screen can read it as "signed out" or as a failure.
      // Its public details travel with it: a run refused because its flow and
      // the flow's queue are full names `max_concurrent_runs` (25.2.10).
      if (result.response.status === 429) {
        const seconds = retryAfterSeconds(result.response.headers.get('retry-after'));
        throw new PlatformRateLimitedError(busyMessage(seconds), seconds, problem.details);
      }
      throw new PlatformError(
        problem.title ?? fallbackProblemTitle(result.response.status),
        result.response.status,
        problem.code,
        problem.details,
      );
    }

    // Successful 204 operations have no `data`; callers use `void`/`null`,
    // never an invented response body.
    return (result.data === undefined ? null : result.data) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** A phone upload can be slow; the web allows the same 15 minutes. */
const UPLOAD_TIMEOUT_MS = 15 * 60_000;

/**
 * PUT a file's bytes to the URL `openUpload` signed (FR-14, BUILD-PLAN 24.3.4).
 *
 * The one request this app sends that is not to the Edge, and the one raw
 * `fetch` the transport audit admits, in this file only. A generated client
 * cannot express a URL the platform signs at runtime, and the bytes must never
 * pass through the Edge (invariant 6). It carries NO credential: the URL is the
 * capability, and a bearer attached here would hand the session to the store.
 * The body must be the exact bytes whose length `openUpload` was told, because
 * the size is signed. It carries the type `openUpload` was told, as a browser
 * sends a file's own: Android's networking refuses a body with none, and the
 * store signs only the length and host. Ported from `snoopy/lib/platform-api.ts`.
 */
export async function putFileToSignedUrl(
  url: string,
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string,
  signal?: AbortSignal,
): Promise<void> {
  const upload = new AbortController();
  const stop = () => upload.abort();
  const timer = setTimeout(stop, UPLOAD_TIMEOUT_MS);
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) stop();
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: bytes,
      credentials: 'omit',
      signal: upload.signal,
    });
  } catch {
    throw new PlatformUnreachableError('The file could not be sent. Try again.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
  if (!response.ok) {
    throw new PlatformError('The file was not accepted. Choose it again.', response.status);
  }
}

/** A downloaded file, to its caller: where it is, and a way to remove it. */
export type SavedFile = Pick<File, 'uri' | 'exists' | 'delete'>;

/**
 * Save the file a signed link points at into the app's cache, for the share
 * sheet (24.12, the owner's build 9: "share or download to files like apple
 * native rather than go to safari") — the complete export, read afresh.
 *
 * The second request this app sends that is not to the Edge, beside
 * `putFileToSignedUrl` and like it carrying NO credential: the URL is the
 * capability, and a bearer attached here would hand the session to the store.
 * It is not a `fetch`: expo-file-system's native download writes the bytes
 * straight into the file. `audit:platform` admits exactly one
 * `downloadFileAsync(`, here. The name is the platform's, without any directory
 * it might carry; a refused or lost download is said in words.
 */
export async function downloadSignedFile(url: string, filename: string): Promise<SavedFile> {
  const base = filename.split(/[\\/]/u).pop()?.trim() ?? '';
  const name = base && base !== '.' && base !== '..' ? base : 'workspace-export';
  try {
    return await File.downloadFileAsync(url, new File(Paths.cache, name), { idempotent: true });
  } catch {
    throw new Error('The file could not be saved.');
  }
}

/** An idempotency key for one mutation intent. */
export function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${Crypto.randomUUID()}`.slice(0, 128);
}

/** Test-only reset for config changes between isolated module loads. */
export function resetPlatformClientsForTests(): void {
  cachedOrigin = null;
  cachedClients = null;
}
