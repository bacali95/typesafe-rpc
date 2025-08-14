export type BaseContext = {
  request: Request;
};

export type Args<Params, Context extends BaseContext, ExtraParams> = {
  params: Params;
  context: Context;
  extraParams: ExtraParams;
};

export type Middleware<
  Params,
  Context extends BaseContext,
  ExtraParams,
  NewExtraParams = object,
> = (args: Args<Params, Context, ExtraParams>) => Promise<NewExtraParams>;

export type Handler<Params, Context extends BaseContext, Result, ExtraParams> = (
  args: Args<Params, Context, ExtraParams>,
) => Promise<Result>;

export interface OverridableHandler<Params, Context extends BaseContext, Result, ExtraParams> {
  (args: Args<Params, Context, ExtraParams>): Promise<Result>;
  overrideMiddlewares: (...middlewares: Middleware<Params, Context, ExtraParams>[]) => this;
}

export interface IRoute<Params, Context extends BaseContext, ExtraParams> {
  middleware<NewParams>(
    ...fns: Middleware<Params, Context, ExtraParams, NewParams>[]
  ): IRoute<Params, Context, ExtraParams & NewParams>;
  handle<Result>(
    fn: Handler<Params, Context, Result, ExtraParams>,
  ): OverridableHandler<Params, Context, Result, Partial<ExtraParams>>;
}

export type RpcSchema = {
  [entity: string]: {
    [operation: string]: Handler<any, any, any, any>;
  };
};
