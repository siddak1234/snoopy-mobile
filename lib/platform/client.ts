import createClient, { type Client, type Middleware } from 'openapi-fetch';
import * as Crypto from 'expo-crypto';

import type { paths as AutomationPaths } from '@/lib/generated/platform-contracts/automations';
import type { paths as ConnectionPaths } from '@/lib/generated/platform-contracts/connections';
import type { paths as PlatformPaths } from '@/lib/generated/platform-contracts/platform';
import { backendApiOrigin } from './origin';
import {
  PlatformError,
  PlatformNotConfiguredError,
  PlatformUnreachableError,
  fallbackProblemTitle,
  publicProblem,
} from './problem';
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
    if (!(await recoverSession())) throw error;
    return await sendOnce(execute);
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

/** An idempotency key for one mutation intent. */
export function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${Crypto.randomUUID()}`.slice(0, 128);
}

/** Test-only reset for config changes between isolated module loads. */
export function resetPlatformClientsForTests(): void {
  cachedOrigin = null;
  cachedClients = null;
}
