import { createWsClient } from '../ws-client';
import { createWsTransport } from '../ws-transport';

const mockTransport = { subscribe: jest.fn().mockReturnValue(jest.fn()) };

jest.mock('../ws-transport', () => ({
  createWsTransport: jest.fn(() => mockTransport),
}));

const mockCreateWsTransport = createWsTransport as jest.MockedFunction<typeof createWsTransport>;

describe('createWsClient', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should build a transport from the given options', () => {
    createWsClient({ url: 'ws://localhost/rpc' });

    expect(mockCreateWsTransport).toHaveBeenCalledWith({ url: 'ws://localhost/rpc' });
  });

  it('should route a subscription call through transport.subscribe', () => {
    const client = createWsClient<any>({ url: 'ws://localhost/rpc' });
    const observer = { onData: jest.fn() };

    client.ticks.onNew({ topic: 'a' }, observer);

    expect(mockTransport.subscribe).toHaveBeenCalledWith(
      'ticks',
      'onNew',
      { topic: 'a' },
      observer,
      undefined,
      undefined,
    );
  });

  it('should forward an AbortSignal and context to transport.subscribe', () => {
    const client = createWsClient<any>({ url: 'ws://localhost/rpc' });
    const observer = { onData: jest.fn() };
    const controller = new AbortController();
    const context = { request: {} as Request };

    client.ticks.onNew({ topic: 'a' }, observer, controller.signal, context);

    expect(mockTransport.subscribe).toHaveBeenCalledWith(
      'ticks',
      'onNew',
      { topic: 'a' },
      observer,
      controller.signal,
      context,
    );
  });

  it('should return the Unsubscribe function from transport.subscribe', () => {
    const unsubscribe = jest.fn();
    mockTransport.subscribe.mockReturnValueOnce(unsubscribe);

    const client = createWsClient<any>({ url: 'ws://localhost/rpc' });
    const result = client.ticks.onNew({}, { onData: jest.fn() });

    expect(result).toBe(unsubscribe);
  });
});
