import type Express from 'express';

export type BaseContext = {
  request: Request | Express.Request;
};

export type Args<Params, Context extends BaseContext> = {
  params: Params;
  context: Context;
};

export type Handler<Params, Context extends BaseContext, Result> = (
  args: Args<Params, Context>,
) => Promise<Result>;

export type SubscriptionHandler<Params, Context extends BaseContext, Result> = (
  args: Args<Params, Context>,
) => AsyncGenerator<Result, void, void>;

export type Operation<Params, Context extends BaseContext, Result> =
  | Handler<Params, Context, Result>
  | SubscriptionHandler<Params, Context, Result>;

export type RpcSchema = {
  [entity: string]: {
    [operation: string]: Operation<any, any, any>;
  };
};
