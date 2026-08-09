import type { Operation, RpcSchema } from '../shared';

export function resolveOperation<T extends RpcSchema>(
  operations: T,
  entity: PropertyKey,
  operation: PropertyKey,
): Operation<any, any, any> | undefined {
  const fn = (operations as any)?.[entity as any]?.[operation as any];

  return typeof fn === 'function' ? fn : undefined;
}

export function isSubscriptionHandler(fn: (...args: any[]) => any): boolean {
  return fn.constructor?.name === 'AsyncGeneratorFunction';
}
