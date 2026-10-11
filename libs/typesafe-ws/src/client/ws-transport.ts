import type { WsServerMessage } from '../shared';
import { WsError } from './ws-error';

export type SubscriptionObserver<Result> = {
  onData: (data: Result) => void;
  onError?: (error: WsError) => void;
  onComplete?: () => void;
};

export type Unsubscribe = () => void;

export type WsClientOptions = {
  url: string;
  protocols?: string | string[];
  WebSocketImpl?: typeof WebSocket;
  reconnect?: boolean | { retries?: number; delayMs?: number | ((attempt: number) => number) };
};

export interface WsClientTransport {
  subscribe(
    entity: string,
    operation: string,
    params: any,
    observer: SubscriptionObserver<any>,
    signal?: AbortSignal,
    context?: any,
  ): Unsubscribe;
}

export function createWsTransport(options: WsClientOptions): WsClientTransport {
  const WebSocketCtor: typeof WebSocket | undefined =
    options.WebSocketImpl ?? (globalThis as any).WebSocket;

  if (!WebSocketCtor) {
    throw new Error(
      'No WebSocket implementation available. Pass WebSocketImpl in createWsClient options.',
    );
  }

  let socket: WebSocket | undefined;
  let connecting: Promise<WebSocket> | undefined;
  let nextId = 0;

  const subscriptions = new Map<
    string,
    { entity: string; operation: string; params: any; observer: SubscriptionObserver<any> }
  >();

  const genId = () => `${Date.now().toString(36)}-${(nextId++).toString(36)}`;

  // A connection that stays up this long is healthy again, so the backoff starts over.
  const STABLE_CONNECTION_MS = 30_000;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let openedAt = 0;

  function resolveReconnectDelay(attempt: number): number {
    if (typeof options.reconnect === 'object' && options.reconnect.delayMs !== undefined) {
      return typeof options.reconnect.delayMs === 'function'
        ? options.reconnect.delayMs(attempt)
        : options.reconnect.delayMs;
    }
    return 1000;
  }

  function failSubscriptions(error: WsError): void {
    for (const { observer } of subscriptions.values()) {
      observer.onError?.(error);
    }
    subscriptions.clear();
  }

  // One pending timer at most: a failed handshake fires both `error` and `close`.
  function scheduleReconnect(): void {
    if (reconnectTimer !== undefined || !subscriptions.size) return;

    attempt++;
    const maxRetries =
      typeof options.reconnect === 'object' ? options.reconnect.retries : undefined;
    if (maxRetries !== undefined && attempt > maxRetries) {
      failSubscriptions(new WsError('connectionClosed', 'WebSocket connection closed'));
      return;
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      ensureConnected()
        .then((ws) => {
          for (const [id, sub] of subscriptions) {
            ws.send(
              JSON.stringify({
                type: 'subscribe',
                id,
                entity: sub.entity,
                operation: sub.operation,
                params: sub.params,
              }),
            );
          }
        })
        .catch(() => scheduleReconnect());
    }, resolveReconnectDelay(attempt));
  }

  function handleClose(event: CloseEvent): void {
    // Only a connection that stayed up resets the backoff; a server that accepts then closes
    // would otherwise restart it at attempt 1 forever.
    if (openedAt && Date.now() - openedAt >= STABLE_CONNECTION_MS) attempt = 0;
    openedAt = 0;

    // 1008 "policy violation": the server rejected the credentials, retrying can't help.
    if (event.code === 1008) {
      failSubscriptions(new WsError('unauthorized', event.reason || 'Unauthorized', 401));
      return;
    }

    if (options.reconnect) {
      scheduleReconnect();
    } else {
      failSubscriptions(new WsError('connectionClosed', 'WebSocket connection closed'));
    }
  }

  function handleMessage(raw: string): void {
    const message: WsServerMessage = JSON.parse(raw);

    switch (message.type) {
      case 'data': {
        subscriptions.get(message.id)?.observer.onData(message.data);
        break;
      }
      case 'complete': {
        subscriptions.get(message.id)?.observer.onComplete?.();
        subscriptions.delete(message.id);
        break;
      }
      case 'error': {
        const error = new WsError(
          message.error.key,
          message.error.message,
          message.error.status,
          message.error.data,
          message.error.issues as any,
        );
        subscriptions.get(message.id)?.observer.onError?.(error);
        subscriptions.delete(message.id);
        break;
      }
    }
  }

  function ensureConnected(): Promise<WebSocket> {
    if (socket && socket.readyState === WebSocketCtor!.OPEN) {
      return Promise.resolve(socket);
    }
    if (connecting) return connecting;

    connecting = new Promise((resolve, reject) => {
      const ws: WebSocket = new WebSocketCtor!(options.url, options.protocols as any);

      ws.addEventListener('open', () => {
        socket = ws;
        openedAt = Date.now();
        connecting = undefined;
        resolve(ws);
      });
      ws.addEventListener('message', (event: MessageEvent) => handleMessage(event.data));
      ws.addEventListener('close', (event: CloseEvent) => {
        connecting = undefined;
        handleClose(event);
      });
      ws.addEventListener('error', (event: any) => {
        connecting = undefined;
        reject(event);
      });
    });

    return connecting;
  }

  return {
    subscribe(entity, operation, params, observer, signal) {
      const id = genId();
      subscriptions.set(id, { entity, operation, params, observer });

      const unsubscribe: Unsubscribe = () => {
        if (!subscriptions.delete(id)) return;
        socket?.send(JSON.stringify({ type: 'unsubscribe', id }));
      };

      signal?.addEventListener('abort', unsubscribe);

      ensureConnected()
        .then((ws) => ws.send(JSON.stringify({ type: 'subscribe', id, entity, operation, params })))
        .catch((error) => {
          subscriptions.delete(id);
          observer.onError?.(
            error instanceof WsError ? error : new WsError('connectionError', 'Failed to connect'),
          );
        });

      return unsubscribe;
    },
  };
}
