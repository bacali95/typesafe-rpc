import * as z from 'zod';

import type { WsServerMessage } from '../../shared';
import { createWsHandler } from '../create-ws-handler';
import { route } from '../route';
import { createWsServer } from '../ws-server';
import type { WsSocket } from '../ws-socket';

function makeSocket() {
  let messageListener: ((data: string) => void) | undefined;
  let closeListener: (() => void) | undefined;

  const socket: WsSocket = {
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

function sentMessages(socket: WsSocket): WsServerMessage[] {
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

describe('createWsHandler', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should send a notImplemented error for an unknown entity/operation', async () => {
    const { socket, dispatch } = makeSocket();
    const operations = {
      ticks: {
        onNew: async function* () {
          yield 'never reached';
        },
      },
    };

    createWsHandler({ socket, context: { request: {} as Request }, operations });
    await dispatch({
      type: 'subscribe',
      id: '1',
      entity: 'unknown',
      operation: 'onNew',
      params: {},
    });

    expect(sentMessages(socket)).toEqual([
      { type: 'error', id: '1', error: { key: 'notImplemented', message: 'Not implemented' } },
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

    createWsHandler({ socket, context: { request: {} as Request }, operations });
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

  it('should send an error frame (via default error handler) on a thrown error', async () => {
    const { socket, dispatch } = makeSocket();
    const operations = {
      ticks: {
        boom: async function* () {
          throw new Error('boom');
          // eslint-disable-next-line no-unreachable
          yield 1;
        },
      },
    };

    createWsHandler({ socket, context: { request: {} as Request }, operations });
    await dispatch({ type: 'subscribe', id: '1', entity: 'ticks', operation: 'boom', params: {} });

    await waitFor(() => sentMessages(socket).length === 1);

    expect(sentMessages(socket)).toEqual([
      { type: 'error', id: '1', error: { key: 'internalError', message: 'Internal Server Error' } },
    ]);
  });

  it('should send an error frame via a custom error handler', async () => {
    const { socket, dispatch } = makeSocket();
    const operations = {
      ticks: {
        boom: async function* (): AsyncGenerator<number> {
          throw new Error('boom');
          // eslint-disable-next-line no-unreachable
          yield 1;
        },
      },
    };
    const errorHandler = jest.fn().mockResolvedValue({ key: 'custom', message: 'Custom error' });

    createWsHandler({ socket, context: { request: {} as Request }, operations, errorHandler });
    await dispatch({ type: 'subscribe', id: '1', entity: 'ticks', operation: 'boom', params: {} });

    await waitFor(() => sentMessages(socket).length === 1);

    expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    expect(sentMessages(socket)).toEqual([
      { type: 'error', id: '1', error: { key: 'custom', message: 'Custom error' } },
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

    createWsHandler({
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

    createWsHandler({ socket, context: { request: {} as Request }, operations });
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

    createWsHandler({ socket, context: { request: {} as Request }, operations });
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

    createWsHandler({ socket, context: { request: {} as Request }, operations });
    await dispatch({ type: 'subscribe', id: '1', entity: 'ticks', operation: 'onNew', params: {} });

    await waitFor(() => sentMessages(socket).length === 1);

    const [message] = sentMessages(socket);
    expect(message).toMatchObject({
      type: 'error',
      id: '1',
      error: { key: 'badRequest', message: 'Bad Request' },
    });
    expect((message as any).error.issues).toHaveLength(1);
  });

  it('should route frames from concurrent subscriptions to their own ids', async () => {
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
    };

    createWsHandler({ socket, context: { request: {} as Request }, operations });

    await Promise.all([
      dispatch({ type: 'subscribe', id: 'sub-a', entity: 'x', operation: 'count3', params: {} }),
      dispatch({ type: 'subscribe', id: 'sub-b', entity: 'y', operation: 'count2', params: {} }),
    ]);

    await waitFor(() => sentMessages(socket).length === 7);

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
  });

  it('delivers frames pushed from outside via a shared server, not just from the handler', async () => {
    const wsServer = createWsServer<any>();
    const { socket, dispatch } = makeSocket();
    const operations = {
      messages: {
        onNew: async function* () {
          await new Promise<never>(() => {
            // never resolves
          });
          // eslint-disable-next-line no-unreachable
          yield undefined;
        },
      },
    };

    createWsHandler({
      socket,
      context: { request: {} as Request },
      operations,
      server: wsServer,
    });
    await dispatch({
      type: 'subscribe',
      id: '1',
      entity: 'messages',
      operation: 'onNew',
      params: { roomId: 'general' },
    });

    wsServer.messages.onNew.emit({ roomId: 'other' }, { text: 'ignored' });
    wsServer.messages.onNew.emit({ roomId: 'general' }, { text: 'hi' });

    await waitFor(() => sentMessages(socket).length === 1);

    expect(sentMessages(socket)).toEqual([{ type: 'data', id: '1', data: { text: 'hi' } }]);
  });

  it('stops delivering server-pushed frames after unsubscribe', async () => {
    const wsServer = createWsServer<any>();
    const { socket, dispatch } = makeSocket();
    const operations = {
      messages: {
        onNew: async function* () {
          await new Promise<never>(() => {
            // never resolves
          });
          // eslint-disable-next-line no-unreachable
          yield undefined;
        },
      },
    };

    createWsHandler({
      socket,
      context: { request: {} as Request },
      operations,
      server: wsServer,
    });
    await dispatch({
      type: 'subscribe',
      id: '1',
      entity: 'messages',
      operation: 'onNew',
      params: {},
    });
    await dispatch({ type: 'unsubscribe', id: '1' });

    wsServer.messages.onNew.emit({}, { text: 'too late' });

    expect(sentMessages(socket)).toEqual([]);
  });
});
