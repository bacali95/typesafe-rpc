import type Express from 'express';

export type BaseContext = {
  request: Request | Express.Request;
};

export type Args<Params, Context> = {
  params: Params;
  context: Context;
  /**
   * Aborted when the subscription ends (unsubscribe or socket close). Pass it to
   * `wsServer.<entity>.<operation>.listen(params, signal)` so a handler parked on
   * `yield*` over an external channel tears down immediately instead of leaking its
   * listener until the channel happens to fire again.
   */
  signal: AbortSignal;
};

export type SubscriptionHandler<Params, Context extends BaseContext, Result> = (
  args: Args<Params, Context>,
) => AsyncGenerator<Result, void, void>;

export type WsSchema = {
  [entity: string]: {
    [operation: string]: SubscriptionHandler<any, any, any>;
  };
};

export type WsSubscribeMessage = {
  type: 'subscribe';
  id: string;
  entity: string;
  operation: string;
  params: any;
};

export type WsUnsubscribeMessage = {
  type: 'unsubscribe';
  id: string;
};

export type WsClientMessage = WsSubscribeMessage | WsUnsubscribeMessage;

export type WsErrorPayload = {
  key: string;
  message: string;
  status?: number;
  data?: any;
  issues?: unknown[];
};

export type WsDataMessage = {
  type: 'data';
  id: string;
  data: any;
};

export type WsCompleteMessage = {
  type: 'complete';
  id: string;
};

export type WsErrorMessage = {
  type: 'error';
  id: string;
  error: WsErrorPayload;
};

export type WsServerMessage = WsDataMessage | WsCompleteMessage | WsErrorMessage;
