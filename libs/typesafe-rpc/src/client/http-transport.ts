import type { BaseContext } from '../shared';
import { fetchData } from './fetch-data';
import type { RpcClientTransport } from './rpc-client-transport';

export function createHttpTransport<Context extends BaseContext = BaseContext>(
  endpoint: string,
  headers?: HeadersInit | ((context?: Context) => HeadersInit),
): RpcClientTransport {
  return {
    call: (entity, operation, params, signal, context) => {
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
    subscribe: () => {
      throw new Error(
        'Subscriptions require the WebSocket transport. Pass { url } to createRpcClient instead of an endpoint string.',
      );
    },
  };
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
