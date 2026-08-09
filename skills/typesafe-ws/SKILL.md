---
name: typesafe-ws
description: Type-safe WebSocket subscriptions library for Node/TS, companion to typesafe-rpc. Defines WsSchema (entity/operation/subscription handler), createWsHandler (server), createWsClient (client), Route and middlewares for subscriptions. Use when editing typesafe-ws, adding subscription operations, wiring a WebSocket server or client, or implementing subscription handlers and middlewares in this repo.
---

# typesafe-ws

## Overview

This package is a type-safe WebSocket **subscriptions** library — the real-time companion to `typesafe-rpc` (plain request/response stays exclusively on `typesafe-rpc`/HTTP; this package never does plain calls). A subscription handler is an `async function*` that `yield`s values; the server multiplexes many concurrent subscriptions over one socket, correlated by a client-generated id; the client is a typed proxy: `client.entity.operation(params, observer, signal?, context?) => Unsubscribe`.

## Core types (shared)

- **BaseContext**: `{ request: Request | Express.Request }`
- **Args&lt;Params, Context&gt;**: `{ params: Params; context: Context }`
- **SubscriptionHandler&lt;Params, Context, Result&gt;**: `(args: Args<Params, Context>) => AsyncGenerator<Result, void, void>`. Any plain `async function*` satisfies this.
- **WsSchema**: `{ [entity: string]: { [operation: string]: SubscriptionHandler<any, any, any> } }` — subscriptions only, no plain `Handler` entries.

## Schema and handlers

Schema is a nested object: entity → operation → subscription handler. Use `as const` so the client gets literal types.

```typescript
import type { BaseContext, SubscriptionHandler } from 'typesafe-ws';

type Ctx = BaseContext & { userId?: string };

const onItemChanged: SubscriptionHandler<{ id: string }, Ctx, { name: string }> = async function* ({
  params,
}) {
  for await (const item of subscribeToItem(params.id)) {
    yield item;
  }
};

export const wsSchema = {
  items: {
    onChanged: onItemChanged,
  },
} as const;
```

## Server: createWsHandler

From `typesafe-ws/server`. Serves a `WsSchema` over one persistent connection, multiplexing concurrent subscriptions by a client-generated `id`. No WebSocket library is a runtime dependency — adapt whatever socket you have (`ws`, Bun native `WebSocket`, uWebSockets.js, Deno, ...) to the minimal `WsSocket` interface.

```typescript
import { createWsHandler } from 'typesafe-ws/server';
import type { WsSocket } from 'typesafe-ws/server';

wss.on('connection', (socket) => {
  createWsHandler({
    context: { request },
    operations: wsSchema,
    errorHandler: (error) => ({ key: 'internalError', message: 'Internal Server Error' }),
    hooks: {
      preCall: (args) => {},
      postCall: (args, performance) => {},
      error: (args, performance, error) => {},
    },
    socket: {
      send: (data) => socket.send(data),
      close: (code, reason) => socket.close(code, reason),
      onMessage: (listener) => socket.on('message', (data) => listener(data.toString())),
      onClose: (listener) => socket.on('close', listener),
    } satisfies WsSocket,
  });
});
```

- Wire protocol (JSON frames, correlated by `id`): client sends `{ type: 'subscribe', id, entity, operation, params }` or `{ type: 'unsubscribe', id }`; server replies with a stream of `{ type: 'data', id, data }` ending in `{ type: 'complete', id }` or `{ type: 'error', id, error }`.
- `unsubscribe` and socket close both call `generator.return()` on the subscription (not awaited, so a handler mid-await on a long-lived event doesn't hang cleanup) — write cleanup (timers, unsubscribing from a broker, etc.) in a `finally` block around the `yield` loop.
- `route(schema).subscribe(fn)` handlers throw the same 400 `Response` shape as `typesafe-rpc`'s `.handle()` on zod validation failure; `defaultErrorHandler` normalizes it into the WS error frame automatically.
- Unknown entity/operation → `{ key: 'notImplemented' }` error frame.

## Client: createWsClient

From `typesafe-ws/client`:

```typescript
import { createWsClient } from 'typesafe-ws/client';
import type { wsSchema } from './ws-schema';

const client = createWsClient<typeof wsSchema>({
  url: 'ws://localhost:3001',
  WebSocketImpl: undefined, // inject e.g. Node's `ws` client outside browsers
  reconnect: { retries: 5, delayMs: 1000 },
});

const unsubscribe = client.items.onChanged(
  { id: '1' },
  {
    onData: (item) => console.log(item),
    onError: (error) => console.error(error), // WsError
    onComplete: () => console.log('done'),
  },
  signal, // optional AbortSignal — aborting also unsubscribes
);
```

- Every operation has one call shape: `client.entity.operation(params, observer, signal?, context?) => Unsubscribe`, where `observer` is `{ onData, onError?, onComplete? }` — no dispatch ambiguity since this package is subscriptions-only.
- With `reconnect` enabled, active subscriptions are automatically re-sent as fresh `subscribe` frames after reconnecting; without it, a closed connection notifies all active subscriptions via `onError`.

## Route and middlewares

From `typesafe-ws/server`: `Route`, `Middleware`, `orMiddleware`. Same shape as `typesafe-rpc`'s, but `.subscribe()` instead of `.handle()`.

- **Middleware&lt;Params, Context&gt;**: `(args: Args<Params, Context>) => Promise<void>` (throw to abort).
- **Route**: chain `.middleware(...fns)` then `.subscribe(fn)` — `fn` must be an `async function*`.
  - Multiple `.middleware(a, b, c)`: **OR** — first success wins (via `orMiddleware`).
  - Chained `.middleware(a).middleware(b)`: **AND** — all run in order.
  - `.subscribe(fn)` runs the middleware chain + zod validation, then `yield* fn(args)`. Validation errors throw before the first `yield`.
- **OverridableSubscriptionHandler**: the function returned by `.subscribe()` has an `overrideMiddlewares(...middlewares)` method (useful for testing).

```typescript
import { Route } from 'typesafe-ws/server';

const subscription = new Route<{ id: string }, BaseContext>()
  .middleware(authOrAnonymous)
  .subscribe(async function* ({ params }) {
    for await (const item of subscribeToItem(params.id)) yield item;
  });

// For testing: bypass middlewares
subscription.overrideMiddlewares(mockAuth);
```

Use the resulting function as the entry stored in the schema (e.g. `onChanged: subscription`).

## Errors

### WsError

From `typesafe-ws/client`. Delivered via an observer's `onError`:

```typescript
import { WsError } from 'typesafe-ws/client';

class WsError extends Error {
  readonly key: string;
  readonly status?: number;
  readonly data?: any;
  readonly issues?: core.$ZodIssue[];
}
```

## Conventions in this repo

- Lives alongside `typesafe-rpc` in this Nx monorepo (`libs/typesafe-ws/`), same three-entry-point pattern (`typesafe-ws`, `typesafe-ws/server`, `typesafe-ws/client`).
- `shared/`: `ws-types.ts` (`SubscriptionHandler`/`WsSchema`/wire protocol message types).
- `server/`: `create-ws-handler.ts`, `route.ts`, `middlewares.ts`, `ws-socket.ts` (the `WsSocket` interface), `default-error-handler.ts`, `hook-types.ts`, `operation-lookup.ts`.
- `client/`: `ws-client.ts` (`createWsClient` + the Proxy), `ws-transport.ts`, `ws-error.ts`.
- No WebSocket library (`ws`, `socket.io`, etc.) is a runtime dependency for this package — it's a devDependency for its own tests only. Server-side code must stay framework-agnostic against `WsSocket`.
- This package intentionally does **not** share a library with `typesafe-rpc` — each package keeps its own small, independent copy of the common context/middleware/hook plumbing (BaseContext/Args/Middleware/orMiddleware/Hooks/HookArgs/resolveOperation) rather than a shared internal Nx lib, because Nx's rollup+tsc declaration bundling in this workspace can't produce portable `.d.ts` output across a cross-project source dependency (it leaks monorepo-internal `dist/` paths into the published types). Don't reintroduce a shared lib for this without solving that first.
- For full API and examples, see the [package README](../../libs/typesafe-ws/README.md).
