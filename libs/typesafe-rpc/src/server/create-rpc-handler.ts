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
    throw new Response('Method not allowed', { status: 405 });
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
      throw new Response('Not implemented', { status: 501 });
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

function getBody(request: Request | Express.Request): Promise<any> {
  if (request instanceof Request) {
    return request.json();
  }
  return request.body;
}
