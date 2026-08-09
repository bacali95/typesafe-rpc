import type { WsError } from './ws-error';

export type SubscriptionObserver<Result> = {
  onData: (data: Result) => void;
  onError?: (error: WsError) => void;
  onComplete?: () => void;
};

export type Unsubscribe = () => void;

export interface RpcClientTransport {
  call(
    entity: string,
    operation: string,
    params: any,
    signal?: AbortSignal,
    context?: any,
  ): Promise<any>;
  subscribe(
    entity: string,
    operation: string,
    params: any,
    observer: SubscriptionObserver<any>,
    signal?: AbortSignal,
    context?: any,
  ): Unsubscribe;
}
