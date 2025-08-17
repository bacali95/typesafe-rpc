export type BaseContext = {
  request: Request;
};

export type Args<Params, Context extends BaseContext> = {
  params: Params;
  context: Context;
};

export type Handler<Params, Context extends BaseContext, Result> = (
  args: Args<Params, Context>,
) => Promise<Result>;

export type RpcSchema = {
  [entity: string]: {
    [operation: string]: Handler<any, any, any>;
  };
};
