# TypeSafe WS

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

A type-safe WebSocket subscriptions library for Node.js, TypeScript, and React applications — the real-time companion to [`typesafe-rpc`](https://github.com/bacali95/typesafe-rpc). Define subscription handlers once and get an end-to-end typed client with zero manual wire-protocol code.

## 🚀 Features

- **Full TypeScript Support**: Subscription payloads are inferred end-to-end from server handler to client observer
- **Subscriptions Only**: A focused, single-purpose transport for server-push streams — plain request/response calls stay on `typesafe-rpc`/HTTP
- **Multiplexed Connection**: Many concurrent subscriptions share one WebSocket, correlated by request id
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

### 3. Create the Client

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

### 4. Use in React

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
