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
            get: (_, operation: string) => (params: any, signal?: AbortSignal, context?: any) => {
              const resolvedHeaders = typeof headers === 'function' ? headers(context) : headers;
              const body = hasFiles(params)
                ? buildFormData(entity, operation, params)
                : JSON.stringify({ entity, operation, params });

              return fetchData(`${endpoint}?${entity}::${operation}`, 'POST', {
                body,
                headers: resolvedHeaders,
                signal,
              });
            },
          },
        ),
    },
  ) as RpcClient<T>;
}

function hasFiles(value: any): boolean {
  if (value instanceof File || value instanceof Blob) return true;
  if (value && typeof value === 'object') {
    return Object.values(value).some(hasFiles);
  }
  return false;
}

function buildFormData(entity: string, operation: string, params: any): FormData {
  const formData = new FormData();
  formData.append('entity', entity);
  formData.append('operation', operation);

  const files: Array<[string, File | Blob]> = [];
  const cleanParams = extractFiles(params, '', files);
  formData.append('params', JSON.stringify(cleanParams));

  for (const [path, file] of files) {
    formData.append(path, file);
  }

  return formData;
}

function extractFiles(value: any, path: string, files: Array<[string, File | Blob]>): any {
  if (value instanceof File || value instanceof Blob) {
    files.push([path, value]);
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      extractFiles(item, path ? `${path}.${index}` : `${index}`, files),
    );
  }
  if (value && typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = extractFiles(val, path ? `${path}.${key}` : key, files);
    }
    return result;
  }
  return value;
}
