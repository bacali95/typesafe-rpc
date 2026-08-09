import { WsError } from '../ws-error';
import { createWsTransport } from '../ws-transport';

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  private listeners: Record<string, Array<(event: any) => void>> = {};

  constructor(
    public url: string,
    public protocols?: string | string[],
  ) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    (this.listeners[type] ??= []).push(listener);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== listener);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close', {});
  }

  emit(type: string, event: any): void {
    for (const listener of this.listeners[type] ?? []) listener(event);
  }

  triggerOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open', {});
  }

  triggerMessage(data: any): void {
    this.emit('message', { data: JSON.stringify(data) });
  }

  triggerClose(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close', {});
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function lastSent(ws: FakeWebSocket): any {
  return JSON.parse(ws.sent[ws.sent.length - 1]);
}

describe('createWsTransport', () => {
  afterEach(() => {
    FakeWebSocket.instances = [];
    jest.clearAllMocks();
  });

  describe('call', () => {
    it('should send a call frame and resolve on a matching result frame', async () => {
      const transport = createWsTransport({
        url: 'ws://test',
        WebSocketImpl: FakeWebSocket as any,
      });

      const promise = transport.call('user', 'get', { id: 1 });
      await flush();

      const ws = FakeWebSocket.instances[0];
      ws.triggerOpen();
      await flush();

      expect(ws.sent).toHaveLength(1);
      const sentMessage = lastSent(ws);
      expect(sentMessage).toMatchObject({
        type: 'call',
        entity: 'user',
        operation: 'get',
        params: { id: 1 },
      });

      ws.triggerMessage({ type: 'result', id: sentMessage.id, result: { name: 'John' } });

      await expect(promise).resolves.toEqual({ name: 'John' });
    });

    it('should reject with a WsError on a matching error frame', async () => {
      const transport = createWsTransport({
        url: 'ws://test',
        WebSocketImpl: FakeWebSocket as any,
      });

      const promise = transport.call('user', 'get', {});
      await flush();

      const ws = FakeWebSocket.instances[0];
      ws.triggerOpen();
      await flush();

      const sentMessage = lastSent(ws);
      ws.triggerMessage({
        type: 'error',
        id: sentMessage.id,
        error: { key: 'notImplemented', message: 'Not implemented', status: 501 },
      });

      await expect(promise).rejects.toBeInstanceOf(WsError);
      await expect(promise).rejects.toMatchObject({
        key: 'notImplemented',
        message: 'Not implemented',
        status: 501,
      });
    });

    it('should correlate concurrent calls independently, even out of order', async () => {
      const transport = createWsTransport({
        url: 'ws://test',
        WebSocketImpl: FakeWebSocket as any,
      });

      const promiseA = transport.call('user', 'get', { id: 'a' });
      const promiseB = transport.call('user', 'get', { id: 'b' });
      await flush();

      const ws = FakeWebSocket.instances[0];
      ws.triggerOpen();
      await flush();

      expect(ws.sent).toHaveLength(2);
      const [messageA, messageB] = ws.sent.map((raw) => JSON.parse(raw));

      // reply out of order: B first, then A
      ws.triggerMessage({ type: 'result', id: messageB.id, result: 'B' });
      ws.triggerMessage({ type: 'result', id: messageA.id, result: 'A' });

      await expect(promiseA).resolves.toBe('A');
      await expect(promiseB).resolves.toBe('B');
    });

    it('should reject locally on AbortSignal without sending an unsubscribe frame', async () => {
      const transport = createWsTransport({
        url: 'ws://test',
        WebSocketImpl: FakeWebSocket as any,
      });
      const controller = new AbortController();

      const promise = transport.call('user', 'get', {}, controller.signal);
      await flush();

      const ws = FakeWebSocket.instances[0];
      ws.triggerOpen();
      await flush();

      controller.abort();

      await expect(promise).rejects.toThrow('Aborted');

      // a late result for the aborted call must not throw or resolve anything
      const sentMessage = lastSent(ws);
      expect(() =>
        ws.triggerMessage({ type: 'result', id: sentMessage.id, result: 'late' }),
      ).not.toThrow();
    });

    it('should reject immediately if the signal is already aborted', async () => {
      const transport = createWsTransport({
        url: 'ws://test',
        WebSocketImpl: FakeWebSocket as any,
      });
      const controller = new AbortController();
      controller.abort();

      await expect(transport.call('user', 'get', {}, controller.signal)).rejects.toThrow('Aborted');
    });
  });

  describe('subscribe', () => {
    it('should send a subscribe frame and route data/complete frames to the observer', async () => {
      const transport = createWsTransport({
        url: 'ws://test',
        WebSocketImpl: FakeWebSocket as any,
      });
      const onData = jest.fn();
      const onComplete = jest.fn();

      transport.subscribe('ticks', 'onNew', {}, { onData, onComplete });
      await flush();

      const ws = FakeWebSocket.instances[0];
      ws.triggerOpen();
      await flush();

      const sentMessage = lastSent(ws);
      expect(sentMessage).toMatchObject({ type: 'subscribe', entity: 'ticks', operation: 'onNew' });

      ws.triggerMessage({ type: 'data', id: sentMessage.id, data: 1 });
      ws.triggerMessage({ type: 'data', id: sentMessage.id, data: 2 });
      ws.triggerMessage({ type: 'complete', id: sentMessage.id });

      expect(onData).toHaveBeenNthCalledWith(1, 1);
      expect(onData).toHaveBeenNthCalledWith(2, 2);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('should route an error frame to onError for a subscription id', async () => {
      const transport = createWsTransport({
        url: 'ws://test',
        WebSocketImpl: FakeWebSocket as any,
      });
      const onData = jest.fn();
      const onError = jest.fn();

      transport.subscribe('ticks', 'onNew', {}, { onData, onError });
      await flush();

      const ws = FakeWebSocket.instances[0];
      ws.triggerOpen();
      await flush();

      const sentMessage = lastSent(ws);
      ws.triggerMessage({
        type: 'error',
        id: sentMessage.id,
        error: { key: 'internalError', message: 'boom' },
      });

      expect(onError).toHaveBeenCalledWith(expect.any(WsError));
      expect(onData).not.toHaveBeenCalled();
    });

    it('should stop routing frames after unsubscribe and send exactly one unsubscribe frame', async () => {
      const transport = createWsTransport({
        url: 'ws://test',
        WebSocketImpl: FakeWebSocket as any,
      });
      const onData = jest.fn();

      const unsubscribe = transport.subscribe('ticks', 'onNew', {}, { onData });
      await flush();

      const ws = FakeWebSocket.instances[0];
      ws.triggerOpen();
      await flush();

      const sentMessage = lastSent(ws);
      ws.triggerMessage({ type: 'data', id: sentMessage.id, data: 1 });
      expect(onData).toHaveBeenCalledTimes(1);

      unsubscribe();
      unsubscribe(); // idempotent: must not send a second unsubscribe frame

      const unsubscribeFrames = ws.sent
        .map((raw) => JSON.parse(raw))
        .filter((m) => m.type === 'unsubscribe');
      expect(unsubscribeFrames).toEqual([{ type: 'unsubscribe', id: sentMessage.id }]);

      ws.triggerMessage({ type: 'data', id: sentMessage.id, data: 2 });
      expect(onData).toHaveBeenCalledTimes(1);
    });

    it('should unsubscribe when the AbortSignal is aborted', async () => {
      const transport = createWsTransport({
        url: 'ws://test',
        WebSocketImpl: FakeWebSocket as any,
      });
      const onData = jest.fn();
      const controller = new AbortController();

      transport.subscribe('ticks', 'onNew', {}, { onData }, controller.signal);
      await flush();

      const ws = FakeWebSocket.instances[0];
      ws.triggerOpen();
      await flush();

      const sentMessage = lastSent(ws);
      controller.abort();

      const unsubscribeFrames = ws.sent
        .map((raw) => JSON.parse(raw))
        .filter((m) => m.type === 'unsubscribe');
      expect(unsubscribeFrames).toEqual([{ type: 'unsubscribe', id: sentMessage.id }]);

      ws.triggerMessage({ type: 'data', id: sentMessage.id, data: 'late' });
      expect(onData).not.toHaveBeenCalled();
    });
  });

  describe('disconnect / reconnect', () => {
    it('should reject in-flight calls when the connection closes', async () => {
      const transport = createWsTransport({
        url: 'ws://test',
        WebSocketImpl: FakeWebSocket as any,
      });

      const promise = transport.call('user', 'get', {});
      await flush();

      const ws = FakeWebSocket.instances[0];
      ws.triggerOpen();
      await flush();

      ws.triggerClose();

      await expect(promise).rejects.toBeInstanceOf(WsError);
    });

    it('should notify subscriptions of onError on close when reconnect is not enabled', async () => {
      const transport = createWsTransport({
        url: 'ws://test',
        WebSocketImpl: FakeWebSocket as any,
      });
      const onError = jest.fn();

      transport.subscribe('ticks', 'onNew', {}, { onData: jest.fn(), onError });
      await flush();

      const ws = FakeWebSocket.instances[0];
      ws.triggerOpen();
      await flush();

      ws.triggerClose();

      expect(onError).toHaveBeenCalledWith(expect.any(WsError));
    });

    it('should resubscribe active subscriptions after reconnecting', async () => {
      const transport = createWsTransport({
        url: 'ws://test',
        WebSocketImpl: FakeWebSocket as any,
        reconnect: { delayMs: 0 },
      });
      const onData = jest.fn();

      transport.subscribe('ticks', 'onNew', { topic: 'a' }, { onData });
      await flush();

      const firstSocket = FakeWebSocket.instances[0];
      firstSocket.triggerOpen();
      await flush();

      const firstSubscribeMessage = lastSent(firstSocket);
      expect(firstSubscribeMessage).toMatchObject({ type: 'subscribe', entity: 'ticks' });

      firstSocket.triggerClose();
      // scheduleReconnect uses setTimeout(..., 0) — wait for it to fire
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(2);
      const secondSocket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
      secondSocket.triggerOpen();
      await flush();

      const resubscribeMessage = secondSocket.sent
        .map((raw) => JSON.parse(raw))
        .find((m) => m.type === 'subscribe');
      expect(resubscribeMessage).toMatchObject({
        type: 'subscribe',
        entity: 'ticks',
        operation: 'onNew',
        params: { topic: 'a' },
        id: firstSubscribeMessage.id,
      });
    });
  });
});
