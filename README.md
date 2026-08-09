# TypeSafe RPC

![NPM Version](https://img.shields.io/npm/v/typesafe-rpc)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

A modern, type-safe RPC (Remote Procedure Call) library for Node.js, TypeScript, and React applications. Built with full TypeScript support, providing end-to-end type safety between client and server.

## 🚀 Features

- **Full TypeScript Support**: Complete type safety from server to client
- **Modern Architecture**: Built for modern web applications with ES modules
- **Middleware Support**: Extensible middleware system for authentication, logging, and more
- **Performance Monitoring**: Built-in hooks for performance tracking
- **Error Handling**: Comprehensive error handling with customizable error responses
- **Abort Signal Support**: Cancel requests with AbortController
- **Zero Dependencies**: Minimal runtime dependencies for optimal bundle size

## 📦 Installation

```bash
npm install typesafe-rpc
# or
yarn add typesafe-rpc
# or
pnpm add typesafe-rpc
# or
bun add typesafe-rpc
```

## 🎯 Quick Start

### 1. Define Your API Schema

```typescript
// api-schema.ts
import type { BaseContext, Handler } from 'typesafe-rpc';

type UserContext = BaseContext & {
  user?: { id: string; name: string };
};

type UserParams = { id: string };
type UserResult = { id: string; name: string; email: string };

const getUserHandler: Handler<UserParams, UserContext, UserResult> = async ({
  params,
  context,
}) => {
  // Your business logic here
  return {
    id: params.id,
    name: 'John Doe',
    email: 'john@example.com',
  };
};

export const apiSchema = {
  users: {
    getById: getUserHandler,
  },
} as const;
```

### 2. Set Up the Server

```typescript
// server.ts
import { createRpcHandler } from 'typesafe-rpc/server';

import { apiSchema } from './api-schema';

export async function handleRequest(request: Request): Promise<Response> {
  const context = { request };

  return createRpcHandler({
    context,
    operations: apiSchema,
    errorHandler: (error) => {
      console.error('RPC Error:', error);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    hooks: {
      preCall: (context) => console.log('RPC call started'),
      postCall: (context, performance) => console.log(`RPC call completed in ${performance}ms`),
      error: (context, performance, error) =>
        console.error(`RPC call failed after ${performance}ms:`, error),
    },
  });
}
```

### 3. Create the Client

```typescript
// client.ts
import { createRpcClient } from 'typesafe-rpc/client';

import type { apiSchema } from './api-schema';

const client = createRpcClient<typeof apiSchema>('/api/rpc');

// Usage with full type safety
const user = await client.users.getById({ id: '123' });
console.log(user.name); // TypeScript knows this exists!
```

### 4. Use in React

```typescript
// React component
import { useState, useEffect } from 'react';
import { client } from './client';

function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    client.users.getById({ id: userId }, controller.signal)
      .then(setUser)
      .catch(console.error)
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [userId]);

  if (loading) return <div>Loading...</div>;
  if (!user) return <div>User not found</div>;

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  );
}
```

Need real-time server-push or subscriptions over WebSocket? See the companion `typesafe-ws` package in this repository — `typesafe-rpc` itself stays focused on HTTP request/response.

## 🔧 API Reference

### Core Types

#### `BaseContext`

```typescript
type BaseContext = {
  request: Request;
};
```

#### `Handler<Params, Context, Result>`

```typescript
type Handler<Params, Context extends BaseContext, Result> = (
  args: Args<Params, Context>,
) => Promise<Result>;
```

#### `RpcSchema`

```typescript
type RpcSchema = {
  [entity: string]: {
    [operation: string]: Handler<any, any, any>;
  };
};
```

### Server API

#### `createRpcHandler<T, Context>`

Creates an RPC handler for processing HTTP requests.

```typescript
function createRpcHandler<T extends RpcSchema, Context extends BaseContext>({
  context,
  operations,
  errorHandler?,
  hooks?,
}: {
  context: Context;
  operations: T;
  errorHandler?: (error: any) => Response;
  hooks?: {
    preCall?: (context: Context) => void;
    postCall?: (context: Context, performance: number) => void;
    error?: (context: Context, performance: number, error: any) => void;
  };
}): Promise<Response>
```

### Client API

#### `createRpcClient<T>(endpoint)`

Creates a type-safe RPC client.

```typescript
function createRpcClient<T extends RpcSchema>(endpoint: string): RpcClient<T>;
```

The returned client provides a proxy that matches your schema structure with full type safety.

### Middleware System

```typescript
import type { Middleware } from 'typesafe-rpc';
import { route } from 'typesafe-rpc/server';

// Authentication middleware: throw to reject the call, resolve to allow it through
const authMiddleware: Middleware<any, BaseContext> = async ({ context }) => {
  const token = context.request.headers.get('Authorization');
  if (!token) throw new Response('Unauthorized', { status: 401 });
};

// Usage with route(): runs the middleware chain (and optional zod validation) before the handler
const protectedHandler = route<UserParams, BaseContext>()
  .middleware(authMiddleware)
  .handle(async ({ params, context }) => {
    return {
      /* ... */
    };
  });
```

## 🛠️ Development

### Prerequisites

- Node.js 18+
- Bun 1.3.5+

### Setup

```bash
git clone https://github.com/bacali95/typesafe-rpc.git
cd typesafe-rpc
bun install
```

### Available Scripts

```bash
# Build the library
bun run build

# Run tests
bun run test

# Lint code
bun run lint

# Format code
bun run prettier:fix

# Check code formatting
bun run prettier:check
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENCE) file for details.

## 🙏 Acknowledgments

- Built with [Nx](https://nx.dev/) for monorepo management
- TypeScript-first design for maximum developer experience
- Modern web standards with ES modules and Fetch API

## 📞 Support

- 📧 Email: nasreddine.bacali95@gmail.com
- 🐛 Issues: [GitHub Issues](https://github.com/bacali95/typesafe-rpc/issues)
- 📖 Documentation: [GitHub Pages](https://bacali95.github.io/typesafe-rpc)

---

Made with ❤️ by [Nasreddine Bac Ali](https://github.com/bacali95)
