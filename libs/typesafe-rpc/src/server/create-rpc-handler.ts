import type Express from 'express';

import type { BaseContext, Handler, RpcSchema } from '../shared';
import type { HookArgs, Hooks } from './hook-types';
import { invokeOperation } from './invoke-operation';
import { resolveOperation } from './operation-lookup';

export async function createRpcHandler<T extends RpcSchema, Context extends BaseContext>({
  context,
  operations,
  errorHandler,
  hooks,
}: {
  context: Context;
  operations: T;
  errorHandler?: (error: any) => Response;
  hooks?: Hooks<T, Context>;
}) {
  if (context.request.method !== 'POST') {
    throw new Response(
      JSON.stringify({
        key: 'methodNotAllowed',
        message: 'Method not allowed',
      }),
      { status: 405 },
    );
  }

  const now = performance.now();

  const { entity, operation, params } = (await getBody(context.request)) as {
    entity: keyof T;
    operation: keyof T[keyof T];
    params: any;
  };

  const hookArgs: HookArgs<T, Context> = { entity, operation, params, context };

  const handler = resolveOperation(operations, entity, operation);

  if (!handler) {
    const error = new Response(
      JSON.stringify({
        key: 'notImplemented',
        message: 'Not implemented',
      }),
      { status: 501 },
    );
    hooks?.error?.(hookArgs, performance.now() - now, error);
    throw errorHandler?.(error) ?? new Response('Internal server error', { status: 500 });
  }

  const outcome = await invokeOperation({
    handler: handler as Handler<any, any, any>,
    entity,
    operation,
    params,
    context,
    hooks,
  });

  if (!outcome.ok) {
    throw errorHandler?.(outcome.error) ?? new Response('Internal server error', { status: 500 });
  }

  return outcome.result;
}

async function getBody(request: Request | Express.Request): Promise<any> {
  if (request instanceof Request) {
    const contentType = request.headers.get('content-type') ?? '';
    if (
      contentType.includes('multipart/form-data') ||
      contentType.includes('application/x-www-form-urlencoded')
    ) {
      const formData = await request.formData();

      const entity = formData.get('entity');
      const operation = formData.get('operation');

      const rawParams = formData.get('params');
      let params: Record<string, any> = {};
      if (typeof rawParams === 'string') {
        try {
          params = JSON.parse(rawParams);
        } catch {
          // keep empty if not valid JSON
        }
      }

      // Merge File entries (by dot-notation key) into params
      const reserved = new Set(['entity', 'operation', 'params']);
      formData.forEach((value, key) => {
        if (!reserved.has(key) && value instanceof File) {
          setNestedValue(params, key, value);
        }
      });

      return { entity, operation, params };
    }
    return request.json();
  }
  // Express.Request
  const contentType = (request.headers as Record<string, string>)['content-type'] ?? '';
  if (
    contentType.includes('multipart/form-data') ||
    contentType.includes('application/x-www-form-urlencoded')
  ) {
    const { entity, operation, params: rawParams } = request.body ?? {};

    let params: Record<string, any> = {};
    if (typeof rawParams === 'string') {
      try {
        params = JSON.parse(rawParams);
      } catch {
        // keep empty if not valid JSON
      }
    } else if (rawParams && typeof rawParams === 'object') {
      params = rawParams;
    }

    // Merge uploaded files from req.files (multer) into params using dot-notation keys
    const files = (request as any).files;
    if (Array.isArray(files)) {
      // multer().any() — array of file objects
      for (const file of files) {
        setNestedValue(params, file.fieldname, file);
      }
    } else if (files && typeof files === 'object') {
      // multer().fields() — object keyed by fieldname, each value is a File[]
      for (const [fieldname, fileArray] of Object.entries(files)) {
        const list = fileArray as any[];
        setNestedValue(params, fieldname, list.length === 1 ? list[0] : list);
      }
    }

    return { entity, operation, params };
  }

  return request.body;
}

function setNestedValue(obj: Record<string, any>, path: string, value: any): void {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof current[keys[i]] !== 'object' || current[keys[i]] === null) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}
