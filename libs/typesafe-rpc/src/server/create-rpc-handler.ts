import type Express from 'express';

import type { BaseContext, Handler, RpcSchema } from '../shared';

type HookArgs<T extends RpcSchema, Context extends BaseContext> = {
  entity: keyof T;
  operation: keyof T[keyof T];
  params: any;
  context: Context;
};

export async function createRpcHandler<T extends RpcSchema, Context extends BaseContext>({
  context,
  operations,
  errorHandler,
  hooks,
}: {
  context: Context;
  operations: T;
  errorHandler?: (error: any) => Response;
  hooks?: {
    preCall?: (args: HookArgs<T, Context>) => void;
    postCall?: (args: HookArgs<T, Context>, performance: number) => void;
    error?: (args: HookArgs<T, Context>, performance: number, error: any) => void;
  };
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

  try {
    if (
      !operations[entity] ||
      !operations[entity][operation] ||
      typeof operations[entity][operation] !== 'function'
    ) {
      throw new Response(
        JSON.stringify({
          key: 'notImplemented',
          message: 'Not implemented',
        }),
        { status: 501 },
      );
    }

    const handler = operations[entity][operation] as Handler<any, any, any>;

    hooks?.preCall?.({ entity, operation, params, context });

    const result = await handler({ params, context });

    hooks?.postCall?.({ entity, operation, params, context }, performance.now() - now);

    return result;
  } catch (error: any) {
    hooks?.error?.({ entity, operation, params, context }, performance.now() - now, error);
    throw errorHandler?.(error) ?? new Response('Internal server error', { status: 500 });
  }
}

async function getBody(request: Request | Express.Request): Promise<any> {
  if (request instanceof Request) {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
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
  if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
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
