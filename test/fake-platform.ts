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
      const reply = queued[route]?.length ? queued[route]!.shift() : standing[route];
      if (reply === undefined) throw new Error(`unrouted ${route}`);
      return { data: typeof reply === 'function' ? (reply as (sent: Sent) => unknown)(entry) : reply };
    };
  const verbs = { GET: call('GET'), POST: call('POST'), PATCH: call('PATCH'), DELETE: call('DELETE') };
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
