import type { WsSchema } from '../shared';

export interface WsServerRegistry {
  register(
    entity: string,
    operation: string,
    params: unknown,
    send: (data: unknown) => void,
  ): () => void;
}

export type WsServer<T extends WsSchema> = {
  [K in keyof T]: {
    [L in keyof T[K]]: T[K][L] extends (args: any) => AsyncGenerator<infer Result, any, any>
      ? { emit(params: Parameters<T[K][L]>[0]['params'], data: Result): void }
      : never;
  };
};

const REGISTRY = Symbol('typesafe-ws.server-registry');

function paramsMatch(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  return (
    aKeys.length === bKeys.length &&
    aKeys.every((key) => paramsMatch((a as any)[key], (b as any)[key]))
  );
}

/**
 * Creates a typed handle onto every active subscription for a `WsSchema`, for use by
 * other parts of the backend (REST controllers, queue consumers, cron jobs, ...) that
 * need to push data into subscriptions from outside the subscription handlers
 * themselves. Share one instance across all connections (pass it to every
 * `createWsHandler` call via the `server` option) so `emit` reaches every matching
 * subscriber process-wide.
 *
 * `emit(params, data)` delivers to subscriptions whose `params` deep-equal the ones
 * passed in; it does not invoke or otherwise affect the subscription handler function.
 */
export function createWsServer<T extends WsSchema>(): WsServer<T> {
  const subscriptions = new Map<string, Set<{ params: unknown; send: (data: unknown) => void }>>();

  const registry: WsServerRegistry = {
    register(entity, operation, params, send) {
      const key = `${entity}.${operation}`;
      let entries = subscriptions.get(key);
      if (!entries) {
        entries = new Set();
        subscriptions.set(key, entries);
      }

      const entry = { params, send };
      entries.add(entry);

      return () => entries!.delete(entry);
    },
  };

  const emit = (entity: string, operation: string, params: unknown, data: unknown) => {
    const entries = subscriptions.get(`${entity}.${operation}`);
    if (!entries) return;

    for (const entry of entries) {
      if (paramsMatch(entry.params, params)) {
        entry.send(data);
      }
    }
  };

  return new Proxy(
    {},
    {
      get: (_, entity) => {
        if (entity === REGISTRY) return registry;

        return new Proxy(
          {},
          {
            get: (_, operation: string) => ({
              emit: (params: unknown, data: unknown) =>
                emit(entity as string, operation, params, data),
            }),
          },
        );
      },
    },
  ) as WsServer<T>;
}

export function getWsServerRegistry(server: unknown): WsServerRegistry | undefined {
  return (server as any)?.[REGISTRY];
}
