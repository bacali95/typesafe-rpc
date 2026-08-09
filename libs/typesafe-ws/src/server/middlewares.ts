import type { Args, BaseContext } from '../shared';

export type Middleware<Params, Context extends BaseContext> = (
  args: Args<Params, Context>,
) => Promise<void>;

export const orMiddleware = <Params, Context extends BaseContext>(
  ...middlewares: Middleware<Params, Context>[]
): Middleware<Params, Context> => {
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
