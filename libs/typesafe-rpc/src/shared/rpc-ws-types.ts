export type RpcWsCallMessage = {
  type: 'call';
  id: string;
  entity: string;
  operation: string;
  params: any;
};

export type RpcWsSubscribeMessage = {
  type: 'subscribe';
  id: string;
  entity: string;
  operation: string;
  params: any;
};

export type RpcWsUnsubscribeMessage = {
  type: 'unsubscribe';
  id: string;
};

export type RpcWsClientMessage = RpcWsCallMessage | RpcWsSubscribeMessage | RpcWsUnsubscribeMessage;

export type RpcWsErrorPayload = {
  key: string;
  message: string;
  status?: number;
  data?: any;
  issues?: unknown[];
};

export type RpcWsResultMessage = {
  type: 'result';
  id: string;
  result: any;
};

export type RpcWsErrorMessage = {
  type: 'error';
  id: string;
  error: RpcWsErrorPayload;
};

export type RpcWsDataMessage = {
  type: 'data';
  id: string;
  data: any;
};

export type RpcWsCompleteMessage = {
  type: 'complete';
  id: string;
};

export type RpcWsServerMessage =
  | RpcWsResultMessage
  | RpcWsErrorMessage
  | RpcWsDataMessage
  | RpcWsCompleteMessage;
