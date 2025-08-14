import type { Args, BaseContext, Middleware } from '../shared';

export const orMiddleware = <
  Params,
  Context extends BaseContext,
  ExtraParams,
  NewExtraParams = object,
>(
  ...middlewares: Middleware<Params, Context, ExtraParams, NewExtraParams>[]
): Middleware<Params, Context, ExtraParams, NewExtraParams> => {
  return async (args) => {
    let firstError: Error | undefined;

    for (const middleware of middlewares) {
      try {
        return await middleware(args);
      } catch (error) {
        firstError ??= error as Error;
      }
    }

    throw firstError;
  };
};
