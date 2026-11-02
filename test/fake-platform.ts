/**
 * A fake of the generated clients behind `platformOperation`, for screen tests
 * that need to see what was sent: every call's method, path template, path
 * values, idempotency key and body, answered by `METHOD /path/template`. A reply
 * that throws is the platform refusing. An unrouted call throws, so a test
 * cannot pass by a screen asking for something nobody expected.
 */
import type { paths as AutomationPaths } from '@/lib/generated/platform-contracts/automations';
import type { paths as ConnectionPaths } from '@/lib/generated/platform-contracts/connections';
import type { paths as PlatformPaths } from '@/lib/generated/platform-contracts/platform';
import { PlatformError } from '@/lib/platform/problem';

/**
 * Every published operation, from the generated contracts: the automation and
 * connection documents own their paths (the root document repeats them without
 * bodies). A reply is typed with its operation's success body (`Answer`), so a
 * reply the platform could not give fails `npm run typecheck`, not a phone.
 */
type Paths = Omit<PlatformPaths, keyof AutomationPaths | keyof ConnectionPaths> & AutomationPaths & ConnectionPaths;
type Verb = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type OperationAt<P extends keyof Paths, V extends Verb> = NonNullable<Paths[P][Lowercase<V> & keyof Paths[P]]>;
export type Route = {
  [P in keyof Paths & string]: { [V in Verb]: [OperationAt<P, V>] extends [never] ? never : `${V} ${P}` }[Verb];
}[keyof Paths & string];
/** What an operation answers on success: its 2xx JSON body, or null for one without a body. */
type Ok = 200 | 201 | 202 | 204;
type Success<O> = O extends { responses: infer R }
  ? { [S in keyof R & Ok]: R[S] extends { content: { 'application/json': infer B } } ? B : null }[keyof R & Ok]
  : never;
export type Answer<R extends Route> = R extends `${infer V extends Verb} ${infer P extends keyof Paths & string}`
  ? Success<OperationAt<P, V>>
  : never;

export type Sent = {
  method: string;
  path: string;
  values: Record<string, string>;
  /** The query parameters sent, when there were any. */
  query?: Record<string, string>;
  key?: string;
  body?: unknown;
};

type Reply<R extends Route> = Answer<R> | ((sent: Sent) => Answer<R> | Promise<Answer<R>>);

export function fakePlatform(platformOperation: jest.Mock) {
  const sent: Sent[] = [];
  const queued: Record<string, unknown[]> = {};
  const standing: Record<string, unknown> = {};

  const call =
    (method: string) =>
    async (
      path: string,
      init?: {
        params?: { path?: Record<string, string>; query?: Record<string, string>; header?: Record<string, string> };
        body?: unknown;
      },
    ) => {
      const entry: Sent = {
        method,
        path,
        values: init?.params?.path ?? {},
        ...(init?.params?.query && Object.keys(init.params.query).length > 0 ? { query: init.params.query } : {}),
        ...(init?.params?.header?.['Idempotency-Key'] ? { key: init.params.header['Idempotency-Key'] } : {}),
        ...(init?.body !== undefined ? { body: init.body } : {}),
      };
      sent.push(entry);
      const route = `${method} ${path}`;
      const reply = queued[route]?.length ? queued[route]!.shift() : (standing[route] ?? fromList(route, entry));
      if (reply === undefined) throw new Error(`unrouted ${route}`);
      return { data: typeof reply === 'function' ? (reply as (sent: Sent) => unknown)(entry) : reply };
    };
  /**
   * One flow's own read (`readSubscription`, §12.1 #319) unrouted: its row from
   * the list as routed (without consuming a queued answer), and 404 when the
   * list does not hold it. A test whose single read differs routes it itself.
   */
  const fromList = (route: string, entry: Sent) => {
    if (route !== 'GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}') return undefined;
    const listRoute = 'GET /v1/workspaces/{workspaceId}/subscriptions';
    const listed = queued[listRoute]?.[0] ?? standing[listRoute];
    if (listed === undefined) return undefined;
    return async () => {
      // The live list, then the archived one, as the screens ask for them.
      for (const query of [undefined, { status: 'archived' }]) {
        const asked: Sent = { method: 'GET', path: listRoute, values: { workspaceId: entry.values.workspaceId ?? '' }, ...(query ? { query } : {}) };
        const list = (await (typeof listed === 'function' ? (listed as (sent: Sent) => unknown)(asked) : listed)) as {
          subscriptions?: { id: string }[];
        };
        const row = list.subscriptions?.find((each) => each.id === entry.values.subscriptionId);
        if (row) return { subscription: row };
      }
      throw new PlatformError('Subscription not found', 404);
    };
  };
  const verbs = { GET: call('GET'), POST: call('POST'), PUT: call('PUT'), PATCH: call('PATCH'), DELETE: call('DELETE') };
  const clients = { platform: verbs, automations: verbs, connections: verbs };
  platformOperation.mockImplementation(async (_key: string, execute: Function) => (await execute(clients)).data);

  return {
    sent,
    /** Every later call to this route answers so. */
    always<R extends Route>(route: R, reply: Reply<R>) {
      standing[route] = reply;
    },
    /** The next call to this route answers so, before any standing answer. */
    once<R extends Route>(route: R, reply: Reply<R>) {
      (queued[route] ??= []).push(reply);
    },
    /** The calls to one route, in order. */
    to(route: string) {
      const [method, path] = route.split(' ');
      return sent.filter((entry) => entry.method === method && entry.path === path);
    },
  };
}
