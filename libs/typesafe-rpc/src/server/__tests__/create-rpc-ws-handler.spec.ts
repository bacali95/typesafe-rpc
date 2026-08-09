import * as z from 'zod';

import type { RpcWsServerMessage } from '../../shared';
import { createRpcWsHandler } from '../create-rpc-ws-handler';
import { route } from '../route';
import type { RpcWsSocket } from '../rpc-ws-socket';

function makeSocket() {
  let messageListener: ((data: string) => void) | undefined;
  let closeListener: (() => void) | undefined;

  const socket: RpcWsSocket = {
    send: jest.fn(),
    close: jest.fn(),
    onMessage: jest.fn((listener) => {
      messageListener = listener;
    }),
    onClose: jest.fn((listener) => {
      closeListener = listener;
    }),
  };

  return {
    socket,
    dispatch: async (message: object) => messageListener?.(JSON.stringify(message)),
    triggerClose: () => closeListener?.(),
  };
}

function sentMessages(socket: RpcWsSocket): RpcWsServerMessage[] {
  return (socket.send as jest.Mock).mock.calls.map(([raw]) => JSON.parse(raw));
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('createRpcWsHandler', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('call', () => {
    it('should send a result frame on success', async () => {
      const { socket, dispatch } = makeSocket();
      const operations = { user: { get: jest.fn().mockResolvedValue({ id: 1 }) } };

      createRpcWsHandler({ socket, context: { request: {} as Request }, operations });
      await dispatch({ type: 'call', id: '1', entity: 'user', operation: 'get', params: {} });

      expect(sentMessages(socket)).toEqual([{ type: 'result', id: '1', result: { id: 1 } }]);
    });

    it('should send an error frame (via default error handler) on failure', async () => {
      const { socket, dispatch } = makeSocket();
      const operations = { user: { get: jest.fn().mockRejectedValue(new Error('boom')) } };

      createRpcWsHandler({ socket, context: { request: {} as Request }, operations });
      await dispatch({ type: 'call', id: '1', entity: 'user', operation: 'get', params: {} });

      expect(sentMessages(socket)).toEqual([
        {
          type: 'error',
          id: '1',
          error: { key: 'internalError', message: 'Internal Server Error' },
        },
      ]);
    });

    it('should send an error frame via a custom error handler', async () => {
      const { socket, dispatch } = makeSocket();
      const operations = { user: { get: jest.fn().mockRejectedValue(new Error('boom')) } };
      const errorHandler = jest.fn().mockResolvedValue({ key: 'custom', message: 'Custom error' });

      createRpcWsHandler({ socket, context: { request: {} as Request }, operations, errorHandler });
      await dispatch({ type: 'call', id: '1', entity: 'user', operation: 'get', params: {} });

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
      expect(sentMessages(socket)).toEqual([
        { type: 'error', id: '1', error: { key: 'custom', message: 'Custom error' } },
      ]);
    });

    it('should send a notImplemented error for an unknown entity/operation', async () => {
      const { socket, dispatch } = makeSocket();
      const operations = { user: { get: jest.fn() } };

      createRpcWsHandler({ socket, context: { request: {} as Request }, operations });
      await dispatch({ type: 'call', id: '1', entity: 'unknown', operation: 'get', params: {} });

      expect(sentMessages(socket)).toEqual([
        { type: 'error', id: '1', error: { key: 'notImplemented', message: 'Not implemented' } },
      ]);
    });

    it('should send a badRequest error when calling a subscription operation via call', async () => {
      const { socket, dispatch } = makeSocket();
      const operations = {
        ticks: {
          onTick: async function* () {
            yield 1;
          },
        },
      };

      createRpcWsHandler({ socket, context: { request: {} as Request }, operations });
      await dispatch({ type: 'call', id: '1', entity: 'ticks', operation: 'onTick', params: {} });

      expect(sentMessages(socket)).toEqual([
        {
          type: 'error',
          id: '1',
          error: { key: 'badRequest', message: 'Operation is a subscription' },
        },
      ]);
    });

    it('should call hooks for a call', async () => {
      const { socket, dispatch } = makeSocket();
      const operations = { user: { get: jest.fn().mockResolvedValue({ id: 1 }) } };
      const preCall = jest.fn();
      const postCall = jest.fn();

      createRpcWsHandler({
        socket,
        context: { request: {} as Request },
        operations,
        hooks: { preCall, postCall },
      });
      await dispatch({
        type: 'call',
        id: '1',
        entity: 'user',
        operation: 'get',
        params: { id: 1 },
      });

      expect(preCall).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'user', operation: 'get', params: { id: 1 } }),
      );
      expect(postCall).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'user', operation: 'get' }),
        expect.any(Number),
      );
    });

    it('should produce a badRequest error from a route() zod validation failure', async () => {
      const { socket, dispatch } = makeSocket();
      const schema = z.object({ name: z.string() });
      const operations = {
        user: {
          create: route(schema).handle(async ({ params }) => params),
        },
      };

      createRpcWsHandler({ socket, context: { request: {} as Request }, operations });
      await dispatch({ type: 'call', id: '1', entity: 'user', operation: 'create', params: {} });

      const [message] = sentMessages(socket);
      expect(message).toMatchObject({
        type: 'error',
        id: '1',
        error: { key: 'badRequest', message: 'Bad Request' },
      });
      expect((message as any).error.issues).toHaveLength(1);
    });
  });

  describe('subscribe', () => {
    it('should send a badRequest error when subscribing to a non-subscription operation', async () => {
      const { socket, dispatch } = makeSocket();
      const operations = { user: { get: jest.fn().mockResolvedValue({}) } };

      createRpcWsHandler({ socket, context: { request: {} as Request }, operations });
      await dispatch({ type: 'subscribe', id: '1', entity: 'user', operation: 'get', params: {} });

      expect(sentMessages(socket)).toEqual([
        {
          type: 'error',
          id: '1',
          error: { key: 'badRequest', message: 'Operation is not a subscription' },
        },
      ]);
    });

    it('should stream data frames then a complete frame', async () => {
      const { socket, dispatch } = makeSocket();
      const operations = {
        ticks: {
          countTo3: async function* () {
            yield 1;
            yield 2;
            yield 3;
          },
        },
      };

      createRpcWsHandler({ socket, context: { request: {} as Request }, operations });
      await dispatch({
        type: 'subscribe',
        id: '1',
        entity: 'ticks',
        operation: 'countTo3',
        params: {},
      });

      await waitFor(() => sentMessages(socket).length === 4);

      expect(sentMessages(socket)).toEqual([
        { type: 'data', id: '1', data: 1 },
        { type: 'data', id: '1', data: 2 },
        { type: 'data', id: '1', data: 3 },
        { type: 'complete', id: '1' },
      ]);
    });

    it('should call preCall/postCall hooks around the subscription lifecycle', async () => {
      const { socket, dispatch } = makeSocket();
      const preCall = jest.fn();
      const postCall = jest.fn();
      const operations = {
        ticks: {
          countTo1: async function* () {
            yield 1;
          },
        },
      };

      createRpcWsHandler({
        socket,
        context: { request: {} as Request },
        operations,
        hooks: { preCall, postCall },
      });
      await dispatch({
        type: 'subscribe',
        id: '1',
        entity: 'ticks',
        operation: 'countTo1',
        params: {},
      });

      await waitFor(() => sentMessages(socket).some((m) => m.type === 'complete'));

      expect(preCall).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'ticks', operation: 'countTo1' }),
      );
      expect(postCall).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'ticks', operation: 'countTo1' }),
        expect.any(Number),
      );
    });

    it('should run the handler finally block and stop sending frames on unsubscribe', async () => {
      const { socket, dispatch } = makeSocket();
      const onCleanup = jest.fn();
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      const operations = {
        ticks: {
          infinite: async function* () {
            try {
              while (true) {
                yield 'tick';
                await sleep(5);
              }
            } finally {
              onCleanup();
            }
          },
        },
      };

      createRpcWsHandler({ socket, context: { request: {} as Request }, operations });
      await dispatch({
        type: 'subscribe',
        id: '1',
        entity: 'ticks',
        operation: 'infinite',
        params: {},
      });

      await waitFor(() => sentMessages(socket).length >= 1);

      await dispatch({ type: 'unsubscribe', id: '1' });
      await waitFor(() => onCleanup.mock.calls.length === 1);

      const countAfterCleanup = sentMessages(socket).length;
      // give any stray async work a chance to run, then assert nothing further was sent
      await sleep(20);
      expect(sentMessages(socket)).toHaveLength(countAfterCleanup);
      expect(sentMessages(socket).every((m) => m.type === 'data' && m.id === '1')).toBe(true);
    });

    it('should run the handler finally block and stop sending frames on socket close', async () => {
      const { socket, dispatch, triggerClose } = makeSocket();
      const onCleanup = jest.fn();
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      const operations = {
        ticks: {
          infinite: async function* () {
            try {
              while (true) {
                yield 'tick';
                await sleep(5);
              }
            } finally {
              onCleanup();
            }
          },
        },
      };

      createRpcWsHandler({ socket, context: { request: {} as Request }, operations });
      await dispatch({
        type: 'subscribe',
        id: '1',
        entity: 'ticks',
        operation: 'infinite',
        params: {},
      });

      await waitFor(() => sentMessages(socket).length >= 1);

      triggerClose();
      await waitFor(() => onCleanup.mock.calls.length === 1);

      const countAfterCleanup = sentMessages(socket).length;
      await sleep(20);
      expect(sentMessages(socket)).toHaveLength(countAfterCleanup);
      expect(sentMessages(socket).every((m) => m.type === 'data' && m.id === '1')).toBe(true);
    });

    it('should produce a badRequest error from a route() zod validation failure before any data is sent', async () => {
      const { socket, dispatch } = makeSocket();
      const schema = z.object({ name: z.string() });
      const operations = {
        ticks: {
          onNew: route(schema).subscribe(async function* ({ params }) {
            yield params;
          }),
        },
      };

      createRpcWsHandler({ socket, context: { request: {} as Request }, operations });
      await dispatch({
        type: 'subscribe',
        id: '1',
        entity: 'ticks',
        operation: 'onNew',
        params: {},
      });

      await waitFor(() => sentMessages(socket).length === 1);

      const [message] = sentMessages(socket);
      expect(message).toMatchObject({
        type: 'error',
        id: '1',
        error: { key: 'badRequest', message: 'Bad Request' },
      });
      expect((message as any).error.issues).toHaveLength(1);
    });
  });

  describe('concurrent multiplexing', () => {
    it('should route frames from concurrent calls and subscriptions to their own ids', async () => {
      const { socket, dispatch } = makeSocket();
      const operations = {
        x: {
          count3: async function* () {
            yield 1;
            yield 2;
            yield 3;
          },
        },
        y: {
          count2: async function* () {
            yield 'a';
            yield 'b';
          },
        },
        z: { echo: jest.fn().mockResolvedValue('echoed') },
      };

      createRpcWsHandler({ socket, context: { request: {} as Request }, operations });

      await Promise.all([
        dispatch({ type: 'subscribe', id: 'sub-a', entity: 'x', operation: 'count3', params: {} }),
        dispatch({ type: 'subscribe', id: 'sub-b', entity: 'y', operation: 'count2', params: {} }),
        dispatch({ type: 'call', id: 'call-c', entity: 'z', operation: 'echo', params: {} }),
      ]);

      await waitFor(() => sentMessages(socket).length === 8);

      const messages = sentMessages(socket);
      const forId = (id: string) => messages.filter((m) => m.id === id);

      expect(forId('sub-a')).toEqual([
        { type: 'data', id: 'sub-a', data: 1 },
        { type: 'data', id: 'sub-a', data: 2 },
        { type: 'data', id: 'sub-a', data: 3 },
        { type: 'complete', id: 'sub-a' },
      ]);
      expect(forId('sub-b')).toEqual([
        { type: 'data', id: 'sub-b', data: 'a' },
        { type: 'data', id: 'sub-b', data: 'b' },
        { type: 'complete', id: 'sub-b' },
      ]);
      expect(forId('call-c')).toEqual([{ type: 'result', id: 'call-c', result: 'echoed' }]);
    });
  });
});
