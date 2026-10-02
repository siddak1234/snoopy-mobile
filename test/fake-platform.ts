/**
 * A fake of the generated clients behind `platformOperation`, for screen tests
 * that need to see what was sent: every call's method, path template, path
 * values, idempotency key and body, answered by `METHOD /path/template`. A reply
 * that throws is the platform refusing. An unrouted call throws, so a test
 * cannot pass by a screen asking for something nobody expected.
 */
export type Sent = {
  method: string;
  path: string;
  values: Record<string, string>;
  /** The query parameters sent, when there were any. */
  query?: Record<string, string>;
  key?: string;
  body?: unknown;
};

type Reply = unknown | ((sent: Sent) => unknown);

export function fakePlatform(platformOperation: jest.Mock) {
  const sent: Sent[] = [];
  const queued: Record<string, Reply[]> = {};
  const standing: Record<string, Reply> = {};

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
    always(route: string, reply: Reply) {
      standing[route] = reply;
    },
    /** The next call to this route answers so, before any standing answer. */
    once(route: string, reply: Reply) {
      (queued[route] ??= []).push(reply);
    },
    /** The calls to one route, in order. */
    to(route: string) {
      const [method, path] = route.split(' ');
      return sent.filter((entry) => entry.method === method && entry.path === path);
    },
  };
}
