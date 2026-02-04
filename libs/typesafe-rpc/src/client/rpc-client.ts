import type { BaseContext, RpcSchema } from '../shared';
import { fetchData } from './fetch-data';

type RpcClient<T extends RpcSchema> = {
  [K in keyof T]: {
    [L in keyof T[K]]: (
      params: Parameters<T[K][L]>[0]['params'],
      signal?: AbortSignal,
      context?: Parameters<T[K][L]>[0]['context'],
    ) => ReturnType<T[K][L]>;
  };
};

export function createRpcClient<T extends RpcSchema, Context extends BaseContext = BaseContext>(
  endpoint: string,
  headers?: HeadersInit | ((context?: Context) => HeadersInit),
): RpcClient<T> {
  return new Proxy(
    {},
    {
      get: (_, entity: string) =>
        new Proxy(
          {},
          {
            get: (_, operation: string) => (params: any, signal?: AbortSignal, context?: any) =>
              fetchData(`${endpoint}?${entity}::${operation}`, 'POST', {
                body: JSON.stringify({ entity, operation, params }),
                headers: typeof headers === 'function' ? headers(context) : headers,
                signal,
              }),
          },
        ),
    },
  ) as RpcClient<T>;
}
