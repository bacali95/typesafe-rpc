import * as z from 'zod';

import type { Args, BaseContext } from '../../shared';
import { Route, route } from '../route';

describe('route', () => {
  const mockContext = {
    request: {} as Request,
  };
  const successMiddleware = jest.fn();
  const failMiddleware = jest.fn().mockRejectedValue(new Error('fail'));
  const mockSubscriptionHandler = async function* ({ params }: Args<object, BaseContext>) {
    yield params;
  };

  async function collect<T>(generator: AsyncGenerator<T, void, void>): Promise<T[]> {
    const values: T[] = [];
    for await (const value of generator) {
      values.push(value);
    }
    return values;
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should work without middleware', async () => {
    const subscription = new Route().subscribe(async function* () {
      yield 'hello';
    });

    await expect(collect(subscription({ params: {}, context: mockContext }))).resolves.toEqual([
      'hello',
    ]);
  });

  it('should work with OR middleware', async () => {
    const route = new Route<object, BaseContext>();

    const subscription1 = route
      .middleware(successMiddleware, successMiddleware, successMiddleware)
      .subscribe(mockSubscriptionHandler);

    await expect(collect(subscription1({ params: {}, context: mockContext }))).resolves.toEqual([
      {},
    ]);
    expect(successMiddleware).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();

    const subscription2 = route
      .middleware(failMiddleware, failMiddleware, successMiddleware)
      .subscribe(mockSubscriptionHandler);

    await expect(collect(subscription2({ params: {}, context: mockContext }))).resolves.toEqual([
      {},
    ]);
    expect(failMiddleware).toHaveBeenCalledTimes(2);
    expect(successMiddleware).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();

    const subscription3 = route
      .middleware(failMiddleware, failMiddleware, failMiddleware)
      .subscribe(mockSubscriptionHandler);

    await expect(collect(subscription3({ params: {}, context: mockContext }))).rejects.toThrow(
      'fail',
    );
    expect(failMiddleware).toHaveBeenCalledTimes(3);
    expect(successMiddleware).not.toHaveBeenCalled();
  });

  it('should work with AND middleware', async () => {
    const route = new Route<object, BaseContext>();

    const subscription1 = route
      .middleware(successMiddleware)
      .middleware(successMiddleware)
      .middleware(successMiddleware)
      .subscribe(mockSubscriptionHandler);

    await expect(collect(subscription1({ params: {}, context: mockContext }))).resolves.toEqual([
      {},
    ]);
    expect(successMiddleware).toHaveBeenCalledTimes(3);

    jest.clearAllMocks();

    const subscription2 = route
      .middleware(successMiddleware)
      .middleware(failMiddleware)
      .middleware(successMiddleware)
      .subscribe(mockSubscriptionHandler);

    await expect(collect(subscription2({ params: {}, context: mockContext }))).rejects.toThrow(
      'fail',
    );
    expect(successMiddleware).toHaveBeenCalledTimes(1);
    expect(failMiddleware).toHaveBeenCalledTimes(1);
  });

  it('should throw a 400 Response on zod validation failure before yielding', async () => {
    const schema = z.object({ name: z.string() });
    const subscription = route(schema).subscribe(mockSubscriptionHandler);

    const generator = subscription({ params: {} as any, context: mockContext });

    await expect(generator.next()).rejects.toBeInstanceOf(Response);
  });

  it('should support overrideMiddlewares', async () => {
    const subscription = new Route<object, BaseContext>()
      .middleware(failMiddleware)
      .subscribe(mockSubscriptionHandler);

    subscription.overrideMiddlewares(successMiddleware);

    await expect(collect(subscription({ params: {}, context: mockContext }))).resolves.toEqual([
      {},
    ]);
    expect(successMiddleware).toHaveBeenCalledTimes(1);
    expect(failMiddleware).not.toHaveBeenCalled();
  });
});
