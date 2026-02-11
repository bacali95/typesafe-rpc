import type { ZodType } from 'zod';
import * as z from 'zod';

import type { Args, BaseContext, Handler } from '../shared';
import { type Middleware, orMiddleware } from './middlewares';

export interface IRoute<Params, Context extends BaseContext> {
  middleware(...fns: Middleware<Params, Context>[]): IRoute<Params, Context>;

  handle<Result>(fn: Handler<Params, Context, Result>): OverridableHandler<Params, Context, Result>;
}

export interface OverridableHandler<Params, Context extends BaseContext, Result> {
  (args: Args<Params, Context>): Promise<Result>;
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

  handle<Output>(
    fn: Handler<Params, Context, Output>,
  ): OverridableHandler<Params, Context, Output> {
    const result: OverridableHandler<Params, Context, Output> = async (args) => {
      for (const middleware of this.middlewares) {
        await middleware(args as Args<Params, Context>);
      }

      if (this.zodSchema) {
        const parsedParams = this.zodSchema.safeParse(args.params);
        if (!parsedParams.success) {
          throw new Response(JSON.stringify({ message: 'Invalid parameters' }), { status: 400 });
        }
      }

      return fn(args as Args<Params, Context>);
    };

    result.overrideMiddlewares = (...middlewares) => {
      this.middlewares = [...middlewares];

      return result;
    };

    return result;
  }
}

export const route = <Params extends object, Context extends BaseContext>(
  zodSchema?: ZodType<Params>,
  middlewares?: Middleware<Params, Context>[],
): IRoute<Params, Context> => new Route<Params, Context>(zodSchema, middlewares);
