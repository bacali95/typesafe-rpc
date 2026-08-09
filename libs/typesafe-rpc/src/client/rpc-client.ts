import type { BaseContext, RpcSchema } from '../shared';
import { createHttpTransport } from './http-transport';
import type { RpcClientTransport, SubscriptionObserver, Unsubscribe } from './rpc-client-transport';
import { type RpcWsClientOptions, createWsTransport } from './ws-transport';

type IsSubscription<F> = F extends (...args: any[]) => AsyncGenerator<any, any, any> ? true : false;

type RpcClient<T extends RpcSchema> = {
  [K in keyof T]: {
    [L in keyof T[K]]: IsSubscription<T[K][L]> extends true
      ? T[K][L] extends (args: any) => AsyncGenerator<infer Result, any, any>
        ? (
            params: Parameters<T[K][L]>[0]['params'],
            observer: SubscriptionObserver<Result>,
            signal?: AbortSignal,
            context?: Parameters<T[K][L]>[0]['context'],
          ) => Unsubscribe
        : never
      : (
          params: Parameters<T[K][L]>[0]['params'],
          signal?: AbortSignal,
          context?: Parameters<T[K][L]>[0]['context'],
        ) => ReturnType<T[K][L]>;
  };
};

export function createRpcClient<T extends RpcSchema, Context extends BaseContext = BaseContext>(
  endpoint: string,
  headers?: HeadersInit | ((context?: Context) => HeadersInit),
): RpcClient<T>;
export function createRpcClient<T extends RpcSchema>(options: RpcWsClientOptions): RpcClient<T>;
export function createRpcClient<T extends RpcSchema, Context extends BaseContext = BaseContext>(
  arg1: string | RpcWsClientOptions,
  arg2?: HeadersInit | ((context?: Context) => HeadersInit),
): RpcClient<T> {
  const transport: RpcClientTransport =
    typeof arg1 === 'string' ? createHttpTransport<Context>(arg1, arg2) : createWsTransport(arg1);

  return buildRpcClientProxy(transport) as RpcClient<T>;
}

function buildRpcClientProxy(transport: RpcClientTransport): unknown {
  return new Proxy(
    {},
    {
      get: (_, entity: string) =>
        new Proxy(
          {},
          {
            get: (_, operation: string) => (params: any, arg2?: any, arg3?: any, arg4?: any) => {
              if (arg2 && typeof arg2 === 'object' && typeof arg2.onData === 'function') {
                return transport.subscribe(entity, operation, params, arg2, arg3, arg4);
              }

              return transport.call(entity, operation, params, arg2, arg3);
            },
          },
        ),
    },
  );
}
