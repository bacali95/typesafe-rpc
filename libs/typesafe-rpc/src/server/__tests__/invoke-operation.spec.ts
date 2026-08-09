import { invokeOperation } from '../invoke-operation';

describe('invokeOperation', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return ok:true with the result and call preCall/postCall hooks', async () => {
    const handler = jest.fn().mockResolvedValue({ id: 1 });
    const preCall = jest.fn();
    const postCall = jest.fn();

    const outcome = await invokeOperation({
      handler,
      entity: 'user',
      operation: 'get',
      params: { id: 1 },
      context: { request: {} as Request },
      hooks: { preCall, postCall },
    });

    expect(outcome).toEqual({ ok: true, result: { id: 1 } });
    expect(handler).toHaveBeenCalledWith({
      params: { id: 1 },
      context: { request: {} as Request },
    });
    expect(preCall).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'user', operation: 'get', params: { id: 1 } }),
    );
    expect(postCall).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'user', operation: 'get' }),
      expect.any(Number),
    );
  });

  it('should return ok:false with the error and call the error hook on failure', async () => {
    const error = new Error('boom');
    const handler = jest.fn().mockRejectedValue(error);
    const errorHook = jest.fn();

    const outcome = await invokeOperation({
      handler,
      entity: 'user',
      operation: 'get',
      params: {},
      context: { request: {} as Request },
      hooks: { error: errorHook },
    });

    expect(outcome).toEqual({ ok: false, error });
    expect(errorHook).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'user', operation: 'get' }),
      expect.any(Number),
      error,
    );
  });

  it('should work without hooks provided', async () => {
    const handler = jest.fn().mockResolvedValue('ok');

    const outcome = await invokeOperation({
      handler,
      entity: 'user',
      operation: 'get',
      params: {},
      context: { request: {} as Request },
    });

    expect(outcome).toEqual({ ok: true, result: 'ok' });
  });
});
