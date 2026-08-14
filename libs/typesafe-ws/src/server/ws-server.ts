import { EventEmitter, on } from 'node:events';

import type { Args, WsSchema } from '../shared';

export type WsServer<T extends WsSchema> = {
  [K in keyof T]: {
    [L in keyof T[K]]: T[K][L] extends (
      args: Args<infer Params, infer Context>,
    ) => AsyncGenerator<infer Result, any, any>
      ? {
          emit(params: Params, data: Result): void;
          listen(args: Args<Params, Context>): AsyncGenerator<Result, void, void>;
        }
      : never;
  };
};

function stableKey(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`;

  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableKey((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}

function channelKey(entity: string, operation: string, params: unknown): string {
  return `${entity}.${operation}:${stableKey(params)}`;
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError';
}

/**
 * Creates a typed handle onto a process-wide event bus for a `WsSchema`, for use by other
 * parts of the backend (REST controllers, queue consumers, cron jobs, ...) that need to push
 * data into subscriptions from outside the subscription handlers themselves.
 *
 * `emit(params, data)` publishes `data` on the channel for that entity/operation/params.
 * `listen(args)` returns an async generator over that same channel, meant to be consumed from
 * inside a subscription handler (typically via `yield*`) by passing the handler's own `args`
 * straight through: `yield* wsServer.entity.operation.listen(args)`.
 *
 * `args.signal` matters, not just `args.params`: an async generator parked on an event that
 * may never come again only unwinds once its *own* pending await settles, so a plain
 * `generator.return()` from the caller can sit queued forever on a quiet channel. The signal
 * lets `listen` tear itself down immediately instead of leaking its listener on the bus.
 */
export function createWsServer<T extends WsSchema>(): WsServer<T> {
  const bus = new EventEmitter();
  bus.setMaxListeners(0);

  return new Proxy(
    {},
    {
      get: (_, entity: string) =>
        new Proxy(
          {},
          {
            get: (_, operation: string) => ({
              emit: (params: unknown, data: unknown) =>
                bus.emit(channelKey(entity, operation, params), data),
              listen: async function* (args: { params: unknown; signal?: AbortSignal }) {
                try {
                  for await (const [data] of on(bus, channelKey(entity, operation, args.params), {
                    signal: args.signal,
                  })) {
                    yield data;
                  }
                } catch (error) {
                  if (!isAbortError(error)) throw error;
                }
              },
            }),
          },
        ),
    },
  ) as WsServer<T>;
}
