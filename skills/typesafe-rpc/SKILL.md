---
name: typesafe-rpc
description: Type-safe RPC library for Node/TS with end-to-end types. Defines schema (entity/operation/handler), createRpcHandler (server), createRpcClient (client), Route and middlewares, plus optional WebSocket support (subscriptions, createRpcWsHandler, WS client, route().subscribe()). Use when editing typesafe-rpc, adding RPC operations or subscriptions, wiring server or client (HTTP or WebSocket), or implementing handlers and middlewares in this repo.
---

# typesafe-rpc

## Overview

This repo is a type-safe RPC library with two transports. Over HTTP, the server accepts POST bodies `{ entity, operation, params }` and runs the matching handler; the client is a typed proxy: `client.entity.operation(params, signal?, context?)`. Over WebSocket (optional), the same schema is served over a persistent, multiplexed connection and can also expose **subscriptions** (server-push streams). Types are shared so client calls are inferred from the schema regardless of transport.

## Core types (shared)

- **BaseContext**: `{ request: Request | Express.Request }`
- **Args&lt;Params, Context&gt;**: `{ params: Params; context: Context }`
- **Handler&lt;Params, Context, Result&gt;**: `(args: Args<Params, Context>) => Promise<Result>`
- **SubscriptionHandler&lt;Params, Context, Result&gt;**: `(args: Args<Params, Context>) => AsyncGenerator<Result, void, void>` — a stream-pushing operation. Any plain `async function*` satisfies this; runtime detection uses `fn.constructor.name === 'AsyncGeneratorFunction'`, no wrapper/marker needed.
- **Operation&lt;Params, Context, Result&gt;**: `Handler<Params, Context, Result> | SubscriptionHandler<Params, Context, Result>`
- **RpcSchema**: `{ [entity: string]: { [operation: string]: Operation<any, any, any> } }`

Handlers receive only `params` and `context` (no ExtraParams). Extend `BaseContext` for app-specific context. Existing `Handler`-only schemas need no changes — `Operation` is a strict superset.

## Schema and handlers

Schema is a nested object: entity → operation → handler (or subscription handler). Use `as const` so the client gets literal types.

```typescript
import type { BaseContext, Handler, SubscriptionHandler } from 'typesafe-rpc';

type Ctx = BaseContext & { userId?: string };

const getItem: Handler<{ id: string }, Ctx, { name: string }> = async ({ params, context }) => {
  return { name: 'Item ' + params.id };
};

// Subscription: a plain async generator, valid over the WebSocket transport only.
const onItemChanged: SubscriptionHandler<{ id: string }, Ctx, { name: string }> = async function* ({
  params,
}) {
  for await (const item of subscribeToItem(params.id)) {
    yield item;
  }
};

export const apiSchema = {
  items: {
    getById: getItem,
    onChanged: onItemChanged,
  },
} as const;
```

## Server: createRpcHandler

From `typesafe-rpc/server`:

```typescript
import { createRpcHandler } from 'typesafe-rpc/server';

const result = await createRpcHandler({
  context: { request },           // must include request
  operations: apiSchema,
  errorHandler: (error) => new Response(JSON.stringify({ error: '...' }), { status: 500 }),
  hooks: {
    preCall: (args) => {},
    postCall: (args, performance) => {},
    error: (args, performance, error) => {},
  },
});
```

- Expects `context.request.method === 'POST'`; body must be JSON `{ entity, operation, params }`.
- Hook args: `{ entity, operation, params, context }`.
- Returns the handler result directly; throws `Response` on error.
- If no `errorHandler`, throws a generic 500 Response.

## Server: createRpcWsHandler (WebSocket, optional)

From `typesafe-rpc/server`. Serves the **same** `operations` schema (both `Handler` and `SubscriptionHandler` entries) over one persistent connection, multiplexing concurrent calls/subscriptions by a client-generated `id`. No WebSocket library is a runtime dependency — adapt whatever socket you have (`ws`, Bun native `WebSocket`, uWebSockets.js, Deno, ...) to the minimal `RpcWsSocket` interface.

```typescript
import { createRpcWsHandler } from 'typesafe-rpc/server';
import type { RpcWsSocket } from 'typesafe-rpc/server';

wss.on('connection', (socket) => {
  createRpcWsHandler({
    context: { request },
    operations: apiSchema,
    errorHandler: (error) => ({ key: 'internalError', message: 'Internal Server Error' }),
    hooks: {
      /* same shape as createRpcHandler */
    },
    socket: {
      send: (data) => socket.send(data),
      close: (code, reason) => socket.close(code, reason),
      onMessage: (listener) => socket.on('message', (data) => listener(data.toString())),
      onClose: (listener) => socket.on('close', listener),
    } satisfies RpcWsSocket,
  });
});
```

- Wire protocol (JSON frames, all correlated by `id`): client sends `{ type: 'call' | 'subscribe', id, entity, operation, params }` or `{ type: 'unsubscribe', id }`; server replies `{ type: 'result', id, result }` / `{ type: 'error', id, error }` for calls, or a stream of `{ type: 'data', id, data }` ending in `{ type: 'complete', id }` / `{ type: 'error', id, error }` for subscriptions.
- Calling a subscription operation via `call`, or a plain `Handler` via `subscribe`, returns a `badRequest` error frame.
- `unsubscribe` and socket close both call `generator.return()` on the subscription (not awaited, so a handler mid-await on a long-lived event doesn't hang cleanup) — write cleanup (timers, unsubscribing from a broker, etc.) in a `finally` block around the `yield` loop.
- `route(schema).subscribe(fn)` handlers throw the same 400 `Response` shape as `.handle()` on zod validation failure; `defaultWsErrorHandler` normalizes it into the WS error frame automatically.
- File uploads are not supported over this transport (JSON-only frames) — use the HTTP transport for those.

## Client: createRpcClient

From `typesafe-rpc/client`. Two overloads: an HTTP endpoint string (unchanged, default), or a WebSocket options object.

```typescript
import { createRpcClient } from 'typesafe-rpc/client';
import type { apiSchema } from './api-schema';

// HTTP (default) — static or dynamic headers
const client = createRpcClient<typeof apiSchema>('/api/rpc', { Authorization: 'Bearer ...' });
const client2 = createRpcClient<typeof apiSchema, MyContext>('/api/rpc', (ctx) => ({
  Authorization: ctx.token,
}));

const result = await client.items.getById({ id: '1' });
const withAbort = await client.items.getById({ id: '1' }, signal);
const withContext = await client.items.getById({ id: '1' }, undefined, context);

// WebSocket — pass { url } instead of an endpoint string
const wsClient = createRpcClient<typeof apiSchema>({
  url: 'ws://localhost:3001',
  WebSocketImpl: undefined, // inject e.g. Node's `ws` client outside browsers
  reconnect: { retries: 5, delayMs: 1000 },
});

const item = await wsClient.items.getById({ id: '1' }); // same call shape as HTTP

const unsubscribe = wsClient.items.onChanged(
  { id: '1' },
  {
    onData: (item) => console.log(item),
    onError: (error) => console.error(error), // WsError
    onComplete: () => console.log('done'),
  },
  signal, // optional AbortSignal — aborting also unsubscribes
);
```

- Regular calls: `client.entity.operation(params, signal?, context?)` — identical over HTTP or WS.
- Subscriptions (WS only): `client.entity.operation(params, observer, signal?, context?) => Unsubscribe`. The proxy tells calls apart from subscriptions at runtime by checking whether the second argument is an object with an `onData` function; the compile-time type (derived from whether the schema entry is a `SubscriptionHandler`) already forces the right shape, so this never collides with an `AbortSignal`.
- HTTP client sends `POST endpoint?entity::operation` with body `{ entity, operation, params }` (or `FormData` if `params` contains `File`/`Blob`). Use the same schema type (`typeof apiSchema`) for full inference regardless of transport.

## Route and middlewares

From `typesafe-rpc/server`: `Route`, `Middleware`, `orMiddleware`.

- **Middleware&lt;Params, Context&gt;**: `(args: Args<Params, Context>) => Promise<void>` (throw to abort).
- **Route**: chain `.middleware(...fns)` then `.handle(handler)` or `.subscribe(handler)`.
  - Multiple `.middleware(a, b, c)`: **OR** — first success wins (via `orMiddleware`).
  - Chained `.middleware(a).middleware(b)`: **AND** — all run in order.
  - `.subscribe(fn)` runs the same middleware chain + zod validation as `.handle(fn)`, then `yield* fn(args)` — `fn` must be an `async function*`. Validation errors throw before the first `yield`.
- **orMiddleware(...middlewares)**: runs middlewares in order; returns on first that doesn't throw; if all throw, rethrows the first error.
- **OverridableHandler** / **OverridableSubscriptionHandler**: the function returned by `.handle()`/`.subscribe()` has an `overrideMiddlewares(...middlewares)` method to replace middlewares (useful for testing).

```typescript
import { Route } from 'typesafe-rpc/server';

const handler = new Route<{ id: string }, BaseContext>()
  .middleware(authOrAnonymous)
  .middleware(requireReadPermission)
  .handle(async ({ params, context }) => ({ name: '...' }));

const subscription = new Route<{ id: string }, BaseContext>()
  .middleware(authOrAnonymous)
  .subscribe(async function* ({ params }) {
    for await (const item of subscribeToItem(params.id)) yield item;
  });

// For testing: bypass middlewares
handler.overrideMiddlewares(mockAuth);
```

Use the resulting function as the entry stored in the schema (e.g. `getById: handler`, `onChanged: subscription`).

## Request/response and errors

- HTTP: server reads body via `request.json()` (Fetch) or `request.body` (Express). Client sends JSON and parses response with `response.json()`. Non-ok responses throw `FetchError`.
- WebSocket: see the wire protocol under **Server: createRpcWsHandler** above. Non-ok responses reject/notify with `WsError`.

### FetchError

From `typesafe-rpc/client`:

```typescript
import { FetchError } from 'typesafe-rpc/client';

class FetchError extends Error {
  readonly key: string;     // error key from response JSON, or 'internalError'
  readonly status: number;  // HTTP status code
  readonly data?: any;      // optional data from response JSON
}
```

The client parses error responses as JSON `{ key, message, data }`. If parsing fails, `key` defaults to `'internalError'` and `message` is the raw response text.

### WsError

From `typesafe-rpc/client`. Field-compatible with `FetchError` (`key`, `message`, `data`, `issues`) but `status` is optional (not every WS error maps to an HTTP status):

```typescript
import { WsError } from 'typesafe-rpc/client';

class WsError extends Error {
  readonly key: string;
  readonly status?: number;
  readonly data?: any;
  readonly issues?: core.$ZodIssue[];
}
```

Delivered via a rejected `call()` promise or an observer's `onError` for subscriptions.

## Conventions in this repo

- Schema and shared types live in `shared/`; server in `server/`, client in `client/`.
  - `shared/`: `rpc-types.ts` (`Handler`/`SubscriptionHandler`/`Operation`/`RpcSchema`), `rpc-ws-types.ts` (WS wire protocol message types).
  - `server/`: `create-rpc-handler.ts` (HTTP), `create-rpc-ws-handler.ts` (WebSocket), `route.ts`, `middlewares.ts`, `rpc-ws-socket.ts` (the `RpcWsSocket` interface), `ws-error.ts` (`defaultWsErrorHandler`). `hook-types.ts` (`Hooks`/`HookArgs`), `invoke-operation.ts` (`invokeOperation` — shared preCall/handler/postCall/error-hook logic), and `operation-lookup.ts` (`resolveOperation`/`isSubscriptionHandler`) are shared between the two handlers — reuse them rather than duplicating dispatch logic.
  - `client/`: `rpc-client.ts` (the public `createRpcClient`, both overloads, and the Proxy), `rpc-client-transport.ts` (the `RpcClientTransport` interface both transports implement), `http-transport.ts`, `ws-transport.ts`, `fetch-data.ts`/`fetch-error.ts` (HTTP), `ws-error.ts` (WS).
- Implementations follow the types in `libs/typesafe-rpc/src/shared/rpc-types.ts`. Prefer those over README if they differ (e.g. no ExtraParams in Handler).
- No WebSocket library (`ws`, `socket.io`, etc.) is a runtime dependency — it's a devDependency for this library's own tests only. Server-side WS code must stay framework-agnostic against `RpcWsSocket`; don't import `ws` (or similar) from non-test source files.
- For full API and examples, see the project [README](../../README.md).
