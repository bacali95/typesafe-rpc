import type { ZodType } from 'zod';

import type { Args, BaseContext, SubscriptionHandler } from '../shared';
import { type Middleware, orMiddleware } from './middlewares';

export interface IRoute<Params, Context extends BaseContext> {
  middleware(...fns: Middleware<Params, Context>[]): IRoute<Params, Context>;

  subscribe<Result>(
    fn: SubscriptionHandler<Params, Context, Result>,
  ): OverridableSubscriptionHandler<Params, Context, Result>;
}

export interface OverridableSubscriptionHandler<Params, Context extends BaseContext, Result> {
  (args: Args<Params, Context>): AsyncGenerator<Result, void, void>;
  overrideMiddlewares: (...middlewares: Middleware<Params, Context>[]) => this;
}

export class Route<Params extends object, Context extends BaseContext> implements IRoute<
  Params,
  Context
> {
  constructor(
    private readonly zodSchema?: ZodType<Params>,
    private middlewares: Middleware<Params, Context>[] = [],
  ) {}

  middleware(...fns: Middleware<Params, Context>[]): IRoute<Params, Context> {
    return new Route<Params, Context>(this.zodSchema, [
      ...this.middlewares,
      orMiddleware<Params, Context>(...fns),
    ] as Middleware<Params, Context>[]);
  }

  subscribe<Output>(
    fn: SubscriptionHandler<Params, Context, Output>,
  ): OverridableSubscriptionHandler<Params, Context, Output> {
    const zodSchema = this.zodSchema;
    let middlewares = this.middlewares;

    const result = async function* (
      args: Args<Params, Context>,
    ): AsyncGenerator<Output, void, void> {
      for (const middleware of middlewares) {
        await middleware(args);
      }

      if (zodSchema) {
        const parsedParams = zodSchema.safeParse(args.params);
        if (!parsedParams.success) {
          throw new Response(
            JSON.stringify({
              key: 'badRequest',
              message: 'Bad Request',
              issues: parsedParams.error.issues,
            }),
            { status: 400 },
          );
        }
      }

      yield* fn(args);
    } as OverridableSubscriptionHandler<Params, Context, Output>;

    result.overrideMiddlewares = (...newMiddlewares) => {
      middlewares = [...newMiddlewares];

      return result;
    };

    return result;
  }
}

export const route = <Params extends object, Context extends BaseContext>(
  zodSchema?: ZodType<Params>,
  middlewares?: Middleware<Params, Context>[],
): IRoute<Params, Context> => new Route<Params, Context>(zodSchema, middlewares);
