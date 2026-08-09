import type {
  BaseContext,
  Handler,
  RpcSchema,
  RpcWsClientMessage,
  RpcWsErrorPayload,
  RpcWsServerMessage,
  SubscriptionHandler,
} from '../shared';
import type { Hooks } from './hook-types';
import { invokeOperation } from './invoke-operation';
import { isSubscriptionHandler, resolveOperation } from './operation-lookup';
import type { RpcWsSocket } from './rpc-ws-socket';
import { defaultWsErrorHandler } from './ws-error';

type ActiveSubscription = {
  generator: AsyncGenerator<any, void, void>;
  unsubscribed: boolean;
};

export function createRpcWsHandler<T extends RpcSchema, Context extends BaseContext>(config: {
  socket: RpcWsSocket;
  context: Context;
  operations: T;
  errorHandler?: (error: any) => RpcWsErrorPayload | Promise<RpcWsErrorPayload>;
  hooks?: Hooks<T, Context>;
}): { close: () => void } {
  const { socket, context, operations, hooks } = config;
  const errorHandler = config.errorHandler ?? defaultWsErrorHandler;
  const activeSubscriptions = new Map<string, ActiveSubscription>();

  const send = (message: RpcWsServerMessage) => socket.send(JSON.stringify(message));

  socket.onMessage(async (raw) => {
    let message: RpcWsClientMessage;
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
        // Not awaited: a subscription handler may be mid-await on a long-lived
        // internal event (e.g. waiting on the next pub/sub message), and
        // generator.return() only resolves once that pending await settles.
        // The `unsubscribed` flag above already stops further frames from
        // reaching the client immediately; cleanup (finally blocks) happens
        // once the generator naturally reaches its next suspension point.
        void entry.generator.return(undefined);
      }
      return;
    }

    const fn = resolveOperation(operations, message.entity, message.operation);

    if (!fn) {
      send({
        type: 'error',
        id: message.id,
        error: { key: 'notImplemented', message: 'Not implemented' },
      });
      return;
    }

    if (message.type === 'call') {
      if (isSubscriptionHandler(fn)) {
        send({
          type: 'error',
          id: message.id,
          error: { key: 'badRequest', message: 'Operation is a subscription' },
        });
        return;
      }

      const outcome = await invokeOperation({
        handler: fn as Handler<any, any, any>,
        entity: message.entity as keyof T,
        operation: message.operation as keyof T[keyof T],
        params: message.params,
        context,
        hooks,
      });

      if (outcome.ok) {
        send({ type: 'result', id: message.id, result: outcome.result });
      } else {
        send({ type: 'error', id: message.id, error: await errorHandler(outcome.error) });
      }
      return;
    }

    // message.type === 'subscribe'
    if (!isSubscriptionHandler(fn)) {
      send({
        type: 'error',
        id: message.id,
        error: { key: 'badRequest', message: 'Operation is not a subscription' },
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
      }
    })();
  });

  socket.onClose(() => {
    for (const entry of activeSubscriptions.values()) {
      entry.unsubscribed = true;
      void entry.generator.return(undefined);
    }
    activeSubscriptions.clear();
  });

  return { close: () => socket.close() };
}
