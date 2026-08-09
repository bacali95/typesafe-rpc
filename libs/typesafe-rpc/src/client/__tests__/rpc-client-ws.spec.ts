import { createHttpTransport } from '../http-transport';
import { createRpcClient } from '../rpc-client';
import { createWsTransport } from '../ws-transport';

const mockHttpTransport = {
  call: jest.fn().mockResolvedValue('http-result'),
  subscribe: jest.fn(),
};
const mockWsTransport = {
  call: jest.fn().mockResolvedValue('ws-result'),
  subscribe: jest.fn().mockReturnValue(jest.fn()),
};

jest.mock('../http-transport', () => ({
  createHttpTransport: jest.fn(() => mockHttpTransport),
}));
jest.mock('../ws-transport', () => ({
  createWsTransport: jest.fn(() => mockWsTransport),
}));

const mockCreateHttpTransport = createHttpTransport as jest.MockedFunction<
  typeof createHttpTransport
>;
const mockCreateWsTransport = createWsTransport as jest.MockedFunction<typeof createWsTransport>;

describe('createRpcClient transport dispatch', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('string overload (HTTP)', () => {
    it('should build an HTTP transport and never touch the WS transport', () => {
      createRpcClient('http://localhost/rpc');

      expect(mockCreateHttpTransport).toHaveBeenCalledWith('http://localhost/rpc', undefined);
      expect(mockCreateWsTransport).not.toHaveBeenCalled();
    });

    it('should forward headers to the HTTP transport', () => {
      const headers = { Authorization: 'Bearer token' };
      createRpcClient('http://localhost/rpc', headers);

      expect(mockCreateHttpTransport).toHaveBeenCalledWith('http://localhost/rpc', headers);
    });

    it('should route a plain call through transport.call', async () => {
      const client = createRpcClient<any>('http://localhost/rpc');

      const result = await (client as any).user.get({ id: 1 });

      expect(result).toBe('http-result');
      expect(mockHttpTransport.call).toHaveBeenCalledWith(
        'user',
        'get',
        { id: 1 },
        undefined,
        undefined,
      );
      expect(mockHttpTransport.subscribe).not.toHaveBeenCalled();
    });

    it('should route a call with an AbortSignal through transport.call, not transport.subscribe', async () => {
      const client = createRpcClient<any>('http://localhost/rpc');
      const controller = new AbortController();

      await (client as any).user.get({ id: 1 }, controller.signal);

      expect(mockHttpTransport.call).toHaveBeenCalledWith(
        'user',
        'get',
        { id: 1 },
        controller.signal,
        undefined,
      );
      expect(mockHttpTransport.subscribe).not.toHaveBeenCalled();
    });
  });

  describe('object overload (WebSocket)', () => {
    it('should build a WS transport and never touch the HTTP transport', () => {
      createRpcClient({ url: 'ws://localhost/rpc' });

      expect(mockCreateWsTransport).toHaveBeenCalledWith({ url: 'ws://localhost/rpc' });
      expect(mockCreateHttpTransport).not.toHaveBeenCalled();
    });

    it('should route a call through transport.call', async () => {
      const client = createRpcClient<any>({ url: 'ws://localhost/rpc' });

      const result = await (client as any).user.get({ id: 1 });

      expect(result).toBe('ws-result');
      expect(mockWsTransport.call).toHaveBeenCalledWith(
        'user',
        'get',
        { id: 1 },
        undefined,
        undefined,
      );
    });

    it('should route a subscribe call (observer as second arg) through transport.subscribe', () => {
      const client = createRpcClient<any>({ url: 'ws://localhost/rpc' });
      const observer = { onData: jest.fn() };

      (client as any).ticks.onNew({}, observer);

      expect(mockWsTransport.subscribe).toHaveBeenCalledWith(
        'ticks',
        'onNew',
        {},
        observer,
        undefined,
        undefined,
      );
      expect(mockWsTransport.call).not.toHaveBeenCalled();
    });

    it('should distinguish a subscribe call from a call with an AbortSignal as the second arg', () => {
      const client = createRpcClient<any>({ url: 'ws://localhost/rpc' });
      const controller = new AbortController();

      (client as any).user.get({ id: 1 }, controller.signal);

      expect(mockWsTransport.call).toHaveBeenCalledWith(
        'user',
        'get',
        { id: 1 },
        controller.signal,
        undefined,
      );
      expect(mockWsTransport.subscribe).not.toHaveBeenCalled();
    });
  });
});
