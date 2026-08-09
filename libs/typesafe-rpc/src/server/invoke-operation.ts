import type { BaseContext, Handler, RpcSchema } from '../shared';
import type { HookArgs, Hooks } from './hook-types';

export type InvokeOperationOutcome = { ok: true; result: any } | { ok: false; error: any };

export async function invokeOperation<T extends RpcSchema, Context extends BaseContext>(args: {
  handler: Handler<any, any, any>;
  entity: keyof T;
  operation: keyof T[keyof T];
  params: any;
  context: Context;
  hooks?: Hooks<T, Context>;
}): Promise<InvokeOperationOutcome> {
  const hookArgs: HookArgs<T, Context> = {
    entity: args.entity,
    operation: args.operation,
    params: args.params,
    context: args.context,
  };
  const now = performance.now();

  try {
    args.hooks?.preCall?.(hookArgs);

    const result = await args.handler({ params: args.params, context: args.context });

    args.hooks?.postCall?.(hookArgs, performance.now() - now);

    return { ok: true, result };
  } catch (error) {
    args.hooks?.error?.(hookArgs, performance.now() - now, error);

    return { ok: false, error };
  }
}
