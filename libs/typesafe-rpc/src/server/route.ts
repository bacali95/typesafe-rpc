import type { Args, BaseContext, Handler } from '../shared';
import { type Middleware, orMiddleware } from './middlewares';

export interface IRoute<Params, Context extends BaseContext, ExtraParams> {
  middleware<NewParams>(
    ...fns: Middleware<Params, Context, ExtraParams, NewParams>[]
  ): IRoute<Params, Context, ExtraParams & NewParams>;
  handle<Result>(
    fn: Handler<Params, Context, Result, ExtraParams>,
  ): OverridableHandler<Params, Context, Result, Partial<ExtraParams>>;
}

export interface OverridableHandler<Params, Context extends BaseContext, Result, ExtraParams> {
  (args: Args<Params, Context, ExtraParams>): Promise<Result>;
  overrideMiddlewares: (...middlewares: Middleware<Params, Context, ExtraParams>[]) => this;
}

export class Route<Params extends object, Context extends BaseContext, ExtraParams>
  implements IRoute<Params, Context, ExtraParams>
{
  constructor(private middlewares: Middleware<Params, Context, ExtraParams>[] = []) {}

  middleware<NewParams>(
    ...fns: Middleware<Params, Context, ExtraParams, NewParams>[]
  ): IRoute<Params, Context, ExtraParams & NewParams> {
    return new Route<Params, Context, ExtraParams & NewParams>([
      ...this.middlewares,
      orMiddleware<Params, Context, ExtraParams, NewParams>(...fns),
    ] as Middleware<Params, Context, ExtraParams & NewParams>[]);
  }

  handle<Output>(
    fn: Handler<Params, Context, Output, ExtraParams>,
  ): OverridableHandler<Params, Context, Output, Partial<ExtraParams>> {
    const result: OverridableHandler<Params, Context, Output, Partial<ExtraParams>> = async (
      args,
    ) => {
      for (const middleware of this.middlewares) {
        args.extraParams = {
          ...args.extraParams,
          ...(await middleware(args as Args<Params, Context, ExtraParams>)),
        };
      }

      return fn(args as Args<Params, Context, ExtraParams>);
    };

    result.overrideMiddlewares = (...middlewares) => {
      this.middlewares = [...middlewares];

      return result;
    };

    return result;
  }
}
