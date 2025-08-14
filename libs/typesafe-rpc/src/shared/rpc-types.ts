export type BaseContext = {
  request: Request;
};

export type Args<Params, Context extends BaseContext, ExtraParams> = {
  params: Params;
  context: Context;
  extraParams: ExtraParams;
};

export type Handler<Params, Context extends BaseContext, Result, ExtraParams> = (
  args: Args<Params, Context, ExtraParams>,
) => Promise<Result>;

export type RpcSchema = {
  [entity: string]: {
    [operation: string]: Handler<any, any, any, any>;
  };
};
