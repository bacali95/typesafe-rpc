import { z } from 'zod';

import type { Args, BaseContext } from '../../shared';
import { Route } from '../route';

describe('route', () => {
  const mockContext = {
    request: {} as Request,
  };
  const successMiddleware = jest.fn();
  const failMiddleware = jest.fn().mockRejectedValue(new Error('fail'));
  const mockHandler = async ({ params }: Args<object, BaseContext>) => params;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should work without middleware', async () => {
    const handler = new Route().handle(async () => 'hello');

    await expect(handler({ params: {}, context: mockContext })).resolves.toBe('hello');
  });

  it('should work with OR middleware', async () => {
    const route = new Route<object, BaseContext>();

    const handler1 = route
      .middleware(successMiddleware, successMiddleware, successMiddleware)
      .handle(mockHandler);

    await expect(handler1({ params: {}, context: mockContext })).resolves.toEqual({});
    expect(successMiddleware).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();

    const handler2 = route
      .middleware(failMiddleware, failMiddleware, successMiddleware)
      .handle(mockHandler);

    await expect(handler2({ params: {}, context: mockContext })).resolves.toEqual({});
    expect(failMiddleware).toHaveBeenCalledTimes(2);
    expect(successMiddleware).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();

    const handler3 = route
      .middleware(failMiddleware, failMiddleware, failMiddleware)
      .handle(mockHandler);

    await expect(handler3({ params: {}, context: mockContext })).rejects.toThrow('fail');
    expect(failMiddleware).toHaveBeenCalledTimes(3);
    expect(successMiddleware).not.toHaveBeenCalled();
  });

  it('should work with AND middleware', async () => {
    const route = new Route<object, BaseContext>();

    const handler1 = route
      .middleware(successMiddleware)
      .middleware(successMiddleware)
      .middleware(successMiddleware)
      .handle(mockHandler);

    await expect(handler1({ params: {}, context: mockContext })).resolves.toEqual({});
    expect(successMiddleware).toHaveBeenCalledTimes(3);

    jest.clearAllMocks();

    const handler2 = route
      .middleware(successMiddleware)
      .middleware(failMiddleware)
      .middleware(successMiddleware)
      .handle(mockHandler);

    await expect(handler2({ params: {}, context: mockContext })).rejects.toThrow('fail');
    expect(successMiddleware).toHaveBeenCalledTimes(1);
    expect(failMiddleware).toHaveBeenCalledTimes(1);
  });
  it('should expose meta and merge it shallowly', () => {
    const handler = new Route<object, BaseContext>()
      .meta({ description: 'first', mcp: { readOnly: true } })
      .middleware(successMiddleware)
      .meta({ mcp: { readOnly: false, destructive: true } })
      .handle(mockHandler);

    expect(handler.meta).toEqual({
      description: 'first',
      mcp: { readOnly: false, destructive: true },
    });
    expect(new Route().handle(mockHandler).meta).toBeUndefined();
  });

  it('should expose the schema', () => {
    const schema = z.object({ id: z.string() });

    expect(new Route(schema).handle(mockHandler).schema).toBe(schema);
    expect(new Route().handle(mockHandler).schema).toBeUndefined();
  });

  it('should expose middlewares live after overrideMiddlewares', () => {
    const handler = new Route<object, BaseContext>()
      .middleware(successMiddleware)
      .handle(mockHandler);

    expect(handler.middlewares).toHaveLength(1);

    handler.overrideMiddlewares(successMiddleware, failMiddleware);

    expect(handler.middlewares).toEqual([successMiddleware, failMiddleware]);
  });

  it('should list the grouped middlewares in parts', () => {
    const handler = new Route<object, BaseContext>()
      .middleware(successMiddleware, failMiddleware)
      .middleware(successMiddleware)
      .handle(mockHandler);

    expect(handler.middlewares.map((group) => group.parts)).toEqual([
      [successMiddleware, failMiddleware],
      [successMiddleware],
    ]);
  });

  it('should pass parsed params to the handler', async () => {
    const schema = z.object({ id: z.string(), limit: z.number().default(10) });
    const fn = jest.fn(async ({ params }: Args<z.infer<typeof schema>, BaseContext>) => params);
    const handler = new Route<z.infer<typeof schema>, BaseContext>(schema).handle(fn);

    await expect(
      handler({ params: { id: 'a' } as z.infer<typeof schema>, context: mockContext }),
    ).resolves.toEqual({ id: 'a', limit: 10 });
    expect(fn).toHaveBeenCalledWith({
      params: { id: 'a', limit: 10 },
      context: mockContext,
    });
  });
});
