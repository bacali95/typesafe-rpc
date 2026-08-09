import type { WsSchema } from '../shared';
import type {
  SubscriptionObserver,
  Unsubscribe,
  WsClientOptions,
  WsClientTransport,
} from './ws-transport';
import { createWsTransport } from './ws-transport';

type WsClient<T extends WsSchema> = {
  [K in keyof T]: {
    [L in keyof T[K]]: T[K][L] extends (args: any) => AsyncGenerator<infer Result, any, any>
      ? (
          params: Parameters<T[K][L]>[0]['params'],
          observer: SubscriptionObserver<Result>,
          signal?: AbortSignal,
          context?: Parameters<T[K][L]>[0]['context'],
        ) => Unsubscribe
      : never;
  };
};

export function createWsClient<T extends WsSchema>(options: WsClientOptions): WsClient<T> {
  const transport: WsClientTransport = createWsTransport(options);

  return new Proxy(
    {},
    {
      get: (_, entity: string) =>
        new Proxy(
          {},
          {
            get:
              (_, operation: string) =>
              (
                params: any,
                observer: SubscriptionObserver<any>,
                signal?: AbortSignal,
                context?: any,
              ) =>
                transport.subscribe(entity, operation, params, observer, signal, context),
          },
        ),
    },
  ) as WsClient<T>;
}
