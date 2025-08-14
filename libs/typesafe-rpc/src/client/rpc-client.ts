import type { RpcSchema } from '../shared';
import { fetchData } from './fetch-data';

type RpcClient<T extends RpcSchema> = {
  [K in keyof T]: {
    [L in keyof T[K]]: (
      params: Parameters<T[K][L]>[0]['params'],
      signal?: AbortSignal,
    ) => ReturnType<T[K][L]>;
  };
};

export function createRpcClient<T extends RpcSchema>(endpoint: string): RpcClient<T> {
  return new Proxy(
    {},
    {
      get: (_, entity: string) =>
        new Proxy(
          {},
          {
            get: (_, operation: string) => (params: any, signal?: AbortSignal) =>
              fetchData(
                `${endpoint}?${entity}::${operation}`,
                'POST',
                { entity, operation, params },
                signal,
              ),
          },
        ),
    },
  ) as RpcClient<T>;
}
