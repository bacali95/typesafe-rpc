import type { ZodType } from 'zod';

import type { Args, BaseContext, Handler } from '../shared';
import { type Middleware, orMiddleware } from './middlewares';

/** Metadata a route carries for tooling, e.g. exposing it as an MCP tool. */
export type RouteMeta = {
  description?: string;
  /** Set to expose the route as an MCP tool (it also needs a zod schema). */
  mcp?:
    | false
    | {
        /** Tool name; defaults to `<entity>_<operation>`. */
        name?: string;
        readOnly?: boolean;
        destructive?: boolean;
      };
};

export interface IRoute<Params, Context extends BaseContext> {
  middleware(...fns: Middleware<Params, Context>[]): IRoute<Params, Context>;

  meta(meta: RouteMeta): IRoute<Params, Context>;

  handle<Result>(fn: Handler<Params, Context, Result>): OverridableHandler<Params, Context, Result>;
}

export interface OverridableHandler<Params, Context extends BaseContext, Result> {
  (args: Args<Params, Context>): Promise<Result>;
  overrideMiddlewares: (...middlewares: Middleware<Params, Context>[]) => this;
  readonly schema?: ZodType<Params>;
  readonly meta?: RouteMeta;
  /** The route's `.middleware(...)` groups, read live (`overrideMiddlewares` replaces them). */
  readonly middlewares: (Middleware<Params, Context> & {
    parts?: Middleware<Params, Context>[];
  })[];
}

export class Route<Params extends object, Context extends BaseContext> implements IRoute<
  Params,
  Context
> {
  constructor(
    private readonly zodSchema?: ZodType<Params>,
    private middlewares: Middleware<Params, Context>[] = [],
    private readonly routeMeta?: RouteMeta,
  ) {}

  middleware(...fns: Middleware<Params, Context>[]): IRoute<Params, Context> {
    return new Route<Params, Context>(
      this.zodSchema,
      [...this.middlewares, orMiddleware<Params, Context>(...fns)] as Middleware<Params, Context>[],
      this.routeMeta,
    );
  }

  meta(meta: RouteMeta): IRoute<Params, Context> {
    return new Route<Params, Context>(this.zodSchema, this.middlewares, {
      ...this.routeMeta,
      ...meta,
    });
  }

  handle<Output>(
    fn: Handler<Params, Context, Output>,
  ): OverridableHandler<Params, Context, Output> {
    const result = (async (args) => {
      for (const middleware of this.middlewares) {
        await middleware(args as Args<Params, Context>);
      }

      if (!this.zodSchema) return fn(args as Args<Params, Context>);

      const parsedParams = this.zodSchema.safeParse(args.params);
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

      return fn({ ...args, params: parsedParams.data } as Args<Params, Context>);
    }) as OverridableHandler<Params, Context, Output>;

    result.overrideMiddlewares = (...middlewares) => {
      this.middlewares = [...middlewares];

      return result;
    };

    Object.defineProperties(result, {
      schema: { value: this.zodSchema, enumerable: true },
      meta: { value: this.routeMeta, enumerable: true },
      middlewares: { get: () => this.middlewares, enumerable: true },
    });

    return result;
  }
}

export const route = <Params extends object, Context extends BaseContext>(
  zodSchema?: ZodType<Params>,
  middlewares?: Middleware<Params, Context>[],
): IRoute<Params, Context> => new Route<Params, Context>(zodSchema, middlewares);
