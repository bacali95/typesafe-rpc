import type { SubscriptionHandler, WsSchema } from '../shared';

export function resolveOperation<T extends WsSchema>(
  operations: T,
  entity: PropertyKey,
  operation: PropertyKey,
): SubscriptionHandler<any, any, any> | undefined {
  const fn = (operations as any)?.[entity as any]?.[operation as any];

  return typeof fn === 'function' ? fn : undefined;
}
