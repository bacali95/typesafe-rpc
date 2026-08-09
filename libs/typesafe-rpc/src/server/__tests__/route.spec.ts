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
});
