# TypeSafe WS

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

A type-safe WebSocket subscriptions library for Node.js, TypeScript, and React applications — the real-time companion to [`typesafe-rpc`](https://github.com/bacali95/typesafe-rpc). Define subscription handlers once and get an end-to-end typed client with zero manual wire-protocol code.

## 🚀 Features

- **Full TypeScript Support**: Subscription payloads are inferred end-to-end from server handler to client observer
- **Subscriptions Only**: A focused, single-purpose transport for server-push streams — plain request/response calls stay on `typesafe-rpc`/HTTP
- **Multiplexed Connection**: Many concurrent subscriptions share one WebSocket, correlated by request id
- **Server-Side Push**: A typed handle onto every active subscription, for other parts of the backend (REST controllers, queue consumers, cron jobs, ...) to push data into without the subscription handler itself producing it
- **Middleware Support**: Same `.middleware()`/zod-validation chain as `typesafe-rpc`'s `route()`
- **Framework-Agnostic Transport**: No WebSocket library is a runtime dependency — adapt whatever socket you have (`ws`, Bun's native `WebSocket`, uWebSockets.js, Deno, ...)
- **Reconnect Support**: Optional automatic reconnect with active-subscription resubscription

## 📦 Installation

```bash
npm install typesafe-ws
# or
yarn add typesafe-ws
# or
pnpm add typesafe-ws
# or
bun add typesafe-ws
```

## 🎯 Quick Start

### 1. Define Your Subscription Schema

A subscription handler is an `async function*` (async generator) — it `yield`s values instead of resolving once.

```typescript
// ws-schema.ts
import type { BaseContext, SubscriptionHandler } from 'typesafe-ws';

type MessageParams = { roomId: string };
type Message = { id: string; text: string };

const onNewMessage: SubscriptionHandler<MessageParams, BaseContext, Message> = async function* ({
  params,
}) {
  for await (const message of subscribeToRoom(params.roomId)) {
    yield message;
  }
};

export const wsSchema = {
  messages: {
    onNew: onNewMessage,
  },
} as const;
```

### 2. Set Up the Server

Adapt whatever WebSocket server you're using to the minimal `WsSocket` interface (`send`/`close`/`onMessage`/`onClose`). Here's an example using [`ws`](https://www.npmjs.com/package/ws):

```typescript
// ws-server.ts
import { createServer } from 'http';
import { createWsHandler } from 'typesafe-ws/server';
import { WebSocketServer } from 'ws';

import { wsSchema } from './ws-schema';

const server = createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', (socket) => {
  createWsHandler({
    context: { request: {} as Request },
    operations: wsSchema,
    socket: {
      send: (data) => socket.send(data),
      close: (code, reason) => socket.close(code, reason),
      onMessage: (listener) => socket.on('message', (data) => listener(data.toString())),
      onClose: (listener) => socket.on('close', listener),
    },
  });
});

server.listen(3001);
```

### 3. Push Data From Elsewhere in the Backend (Optional)

If a subscription's data comes from somewhere else in your app rather than the handler itself — a REST controller, a queue consumer, a cron job — wire up a `WsServer` handle, a typed façade over a process-wide event bus:

```typescript
// ws-server-handle.ts
import { createWsServer } from 'typesafe-ws/server';

import { wsSchema } from './ws-schema';

export const wsServer = createWsServer<typeof wsSchema>();
```

The subscription handler consumes its channel with `listen(args)`, passing its own `args` straight through:

```typescript
// ws-schema.ts
import { wsServer } from './ws-server-handle';

const onNewMessage: SubscriptionHandler<{ roomId: string }, BaseContext, Message> =
  async function* (args) {
    yield* wsServer.messages.onNew.listen(args);
  };
```

Any other module can now push into matching subscriptions without going through the handler:

```typescript
// messages-controller.ts
import { wsServer } from './ws-server-handle';

app.post('/rooms/:roomId/messages', (req, res) => {
  const message = saveMessage(req.params.roomId, req.body);
  wsServer.messages.onNew.emit({ roomId: req.params.roomId }, message);
  res.sendStatus(201);
});
```

`emit(params, data)` publishes `data` on the channel for that entity/operation/params; `listen(args)` returns an async generator over that same channel, keyed off `args.params` and torn down via `args.signal`. `createWsHandler` aborts each subscription's `signal` on unsubscribe/socket-close, which is why passing `args` straight through matters: an async generator parked on an event that may never come again (a quiet room) only unwinds once its _own_ pending await settles, so without the signal a plain unsubscribe can leave its listener on the bus forever. `emit` never invokes the handler function directly — it's a pure pub/sub hop, and it only reaches subscriptions in the same process.

### 4. Create the Client

```typescript
// ws-client.ts
import { createWsClient } from 'typesafe-ws/client';

import type { wsSchema } from './ws-schema';

const client = createWsClient<typeof wsSchema>({ url: 'ws://localhost:3001' });

const unsubscribe = client.messages.onNew(
  { roomId: 'general' },
  {
    onData: (message) => console.log('New message:', message.text),
    onError: (error) => console.error(error),
    onComplete: () => console.log('Subscription ended'),
  },
);

// later:
unsubscribe();
```

### 5. Use in React

```typescript
// React component
import { useEffect, useState } from 'react';
import { client } from './ws-client';

function RoomMessages({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    const unsubscribe = client.messages.onNew(
      { roomId },
      { onData: (message) => setMessages((prev) => [...prev, message]) },
      controller.signal, // aborting also unsubscribes
    );

    return () => unsubscribe();
  }, [roomId]);

  return (
    <ul>
      {messages.map((m) => (
        <li key={m.id}>{m.text}</li>
      ))}
    </ul>
  );
}
```

## 🔧 API Reference

### Core Types

#### `BaseContext`

```typescript
type BaseContext = {
  request: Request | Express.Request;
};
```

#### `SubscriptionHandler<Params, Context, Result>`

```typescript
type SubscriptionHandler<Params, Context extends BaseContext, Result> = (
  args: Args<Params, Context>,
) => AsyncGenerator<Result, void, void>;

type Args<Params, Context> = {
  params: Params;
  context: Context;
  signal: AbortSignal; // aborted on unsubscribe/socket-close
};
```

#### `WsSchema`

```typescript
type WsSchema = {
  [entity: string]: {
    [operation: string]: SubscriptionHandler<any, any, any>;
  };
};
```

### Server API

#### `createWsHandler<T, Context>`

Wires a `WsSchema` into a persistent WebSocket connection. Multiple subscriptions are multiplexed over the one `socket`, correlated by a client-generated id.

```typescript
function createWsHandler<T extends WsSchema, Context extends BaseContext>(config: {
  socket: WsSocket;
  context: Context;
  operations: T;
  errorHandler?: (error: any) => WsErrorPayload | Promise<WsErrorPayload>;
  hooks?: {
    preCall?: (context: Context) => void;
    postCall?: (context: Context, performance: number) => void;
    error?: (context: Context, performance: number, error: any) => void;
  };
}): { close: () => void };
```

`WsSocket` is the minimal interface any WebSocket implementation must be adapted to — `typesafe-ws` does not depend on `ws`, `socket.io`, or any other WebSocket library:

```typescript
interface WsSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onMessage(listener: (data: string) => void): void;
  onClose(listener: () => void): void;
}
```

#### `createWsServer<T>()`

Returns a typed handle onto a process-wide event bus for a `WsSchema`, for parts of the backend outside the subscription handlers to push data into. Create one instance and import it wherever it's needed — both from the handler (via `listen`) and from anything pushing into it (via `emit`):

```typescript
function createWsServer<T extends WsSchema>(): WsServer<T>;

type WsServer<T extends WsSchema> = {
  [entity]: {
    [operation]: {
      emit(params: Params, data: Result): void;
      listen(args: Args<Params, Context>): AsyncGenerator<Result, void, void>;
    };
  };
};
```

`emit(params, data)` publishes `data` on the channel identified by that entity/operation/params tuple. `listen(args)` returns an async generator over that same channel, keyed off `args.params` and torn down via `args.signal` — call it from inside a subscription handler, passing the handler's own `args` straight through, typically via `yield* wsServer.entity.operation.listen(args)`. Passing `args` (rather than just `params`) matters: without `args.signal`, the generator tears down only when its channel happens to fire again, leaking its listener on the bus in the meantime. `emit` and `listen` never invoke the subscription handler function directly; they're independent producer/consumer ends of the same channel.

**Wire protocol** (JSON frames, correlated by `id`): client sends `{ type: 'subscribe', id, entity, operation, params }` or `{ type: 'unsubscribe', id }`; server replies with a stream of `{ type: 'data', id, data }` ending in `{ type: 'complete', id }` or `{ type: 'error', id, error }`.

`unsubscribe` and socket close both call `generator.return()` on the subscription — write cleanup (timers, unsubscribing from a broker, etc.) in a `finally` block around your `yield` loop.

### Client API

#### `createWsClient<T>(options)`

```typescript
function createWsClient<T extends WsSchema>(options: {
  url: string;
  protocols?: string | string[];
  WebSocketImpl?: typeof WebSocket; // inject e.g. Node's `ws` client outside browsers
  reconnect?: boolean | { retries?: number; delayMs?: number | ((attempt: number) => number) };
}): WsClient<T>;
```

Every operation gets the call signature `(params, observer, signal?, context?) => Unsubscribe`, where `observer` is `{ onData, onError?, onComplete? }`. Passing an `AbortSignal` unsubscribes automatically when it aborts.

### Route and middlewares

Same shape as `typesafe-rpc`'s `route()`, but `.subscribe()` instead of `.handle()`:

```typescript
import { route } from 'typesafe-ws/server';
import * as z from 'zod';

const onNewMessage = route(z.object({ roomId: z.string() }))
  .middleware(authMiddleware)
  .subscribe(async function* ({ params }) {
    for await (const message of subscribeToRoom(params.roomId)) {
      yield message;
    }
  });
```

Validation errors (and any thrown `Response`) are normalized into the WS error frame shape automatically.

### WsError

```typescript
import { WsError } from 'typesafe-ws/client';

class WsError extends Error {
  readonly key: string;
  readonly status?: number;
  readonly data?: any;
  readonly issues?: core.$ZodIssue[];
}
```

Delivered via an observer's `onError`.

## 🛠️ Development

This package lives in the same Nx monorepo as `typesafe-rpc` — see the [root README](../../README.md) for setup and available scripts (`bun run build`, `bun run test`, `bun run lint`, etc.), scoped to this project via `nx run typesafe-ws:<target>`.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../../LICENCE) file for details.
