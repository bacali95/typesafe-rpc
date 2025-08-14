import type { BaseContext, Handler, RpcSchema } from '../shared';

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
    preCall?: (context: Context) => void;
    postCall?: (context: Context, performance: number) => void;
    error?: (context: Context, performance: number, error: any) => void;
  };
}) {
  if (context.request.method !== 'POST') {
    throw new Response('Method not allowed', { status: 405 });
  }

  const now = performance.now();

  const { entity, operation, params } = (await context.request.json()) as {
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

    const handler = operations[entity][operation] as Handler<any, any, any, any>;

    hooks?.preCall?.(context);

    const result = await handler({ params, context, extraParams: {} });

    hooks?.postCall?.(context, performance.now() - now);

    return result;
  } catch (error: any) {
    hooks?.error?.(context, performance.now() - now, error);
    throw errorHandler?.(error) ?? new Response('Internal server error', { status: 500 });
  }
}
