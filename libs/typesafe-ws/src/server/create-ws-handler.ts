import type {
  BaseContext,
  SubscriptionHandler,
  WsClientMessage,
  WsErrorPayload,
  WsSchema,
  WsServerMessage,
} from '../shared';
import { defaultErrorHandler } from './default-error-handler';
import type { Hooks } from './hook-types';
import { resolveOperation } from './operation-lookup';
import { type WsServer, getWsServerRegistry } from './ws-server';
import type { WsSocket } from './ws-socket';

type ActiveSubscription = {
  generator: AsyncGenerator<any, void, void>;
  unsubscribed: boolean;
  unregisterFromServer?: () => void;
};

export function createWsHandler<T extends WsSchema, Context extends BaseContext>(config: {
  socket: WsSocket;
  context: Context;
  operations: T;
  errorHandler?: (error: any) => WsErrorPayload | Promise<WsErrorPayload>;
  hooks?: Hooks<T, Context>;
  server?: WsServer<T>;
}): { close: () => void } {
  const { socket, context, operations, hooks, server } = config;
  const errorHandler = config.errorHandler ?? defaultErrorHandler;
  const registry = server ? getWsServerRegistry(server) : undefined;
  const activeSubscriptions = new Map<string, ActiveSubscription>();

  const send = (message: WsServerMessage) => socket.send(JSON.stringify(message));

  socket.onMessage(async (raw) => {
    let message: WsClientMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.type === 'unsubscribe') {
      const entry = activeSubscriptions.get(message.id);
      if (entry) {
        entry.unsubscribed = true;
        activeSubscriptions.delete(message.id);
        entry.unregisterFromServer?.();
        // Not awaited: a subscription handler may be mid-await on a long-lived
        // internal event, and generator.return() only resolves once that
        // pending await settles. The `unsubscribed` flag above already stops
        // further frames from reaching the client immediately.
        void entry.generator.return(undefined);
      }
      return;
    }

    // message.type === 'subscribe'
    const fn = resolveOperation(operations, message.entity, message.operation);

    if (!fn) {
      send({
        type: 'error',
        id: message.id,
        error: { key: 'notImplemented', message: 'Not implemented' },
      });
      return;
    }

    const hookArgs = {
      entity: message.entity as keyof T,
      operation: message.operation as keyof T[keyof T],
      params: message.params,
      context,
    };
    hooks?.preCall?.(hookArgs);

    const generator = (fn as SubscriptionHandler<any, any, any>)({
      params: message.params,
      context,
    });
    const entry: ActiveSubscription = { generator, unsubscribed: false };
    if (registry) {
      entry.unregisterFromServer = registry.register(
        message.entity,
        message.operation,
        message.params,
        (data) => {
          if (!entry.unsubscribed) send({ type: 'data', id: message.id, data });
        },
      );
    }
    activeSubscriptions.set(message.id, entry);
    const start = performance.now();

    (async () => {
      try {
        for await (const value of generator) {
          if (entry.unsubscribed) break;
          send({ type: 'data', id: message.id, data: value });
        }
        if (!entry.unsubscribed) {
          hooks?.postCall?.(hookArgs, performance.now() - start);
          send({ type: 'complete', id: message.id });
        }
      } catch (error) {
        if (!entry.unsubscribed) {
          hooks?.error?.(hookArgs, performance.now() - start, error);
          send({ type: 'error', id: message.id, error: await errorHandler(error) });
        }
      } finally {
        activeSubscriptions.delete(message.id);
        entry.unregisterFromServer?.();
      }
    })();
  });

  socket.onClose(() => {
    for (const entry of activeSubscriptions.values()) {
      entry.unsubscribed = true;
      entry.unregisterFromServer?.();
      void entry.generator.return(undefined);
    }
    activeSubscriptions.clear();
  });

  return { close: () => socket.close() };
}
