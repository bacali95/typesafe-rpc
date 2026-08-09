import { createWsServer, getWsServerRegistry } from '../ws-server';

describe('createWsServer', () => {
  it('emits to a subscription registered with deeply-equal params', () => {
    const server = createWsServer<any>();
    const registry = getWsServerRegistry(server)!;
    const send = jest.fn();

    registry.register('messages', 'onNew', { roomId: 'general' }, send);
    server.messages.onNew.emit({ roomId: 'general' }, { text: 'hi' });

    expect(send).toHaveBeenCalledWith({ text: 'hi' });
  });

  it('does not emit to a subscription with different params', () => {
    const server = createWsServer<any>();
    const registry = getWsServerRegistry(server)!;
    const send = jest.fn();

    registry.register('messages', 'onNew', { roomId: 'general' }, send);
    server.messages.onNew.emit({ roomId: 'random' }, { text: 'hi' });

    expect(send).not.toHaveBeenCalled();
  });

  it('does not emit to a different entity/operation', () => {
    const server = createWsServer<any>();
    const registry = getWsServerRegistry(server)!;
    const send = jest.fn();

    registry.register('messages', 'onNew', {}, send);
    server.messages.onEdit.emit({}, { text: 'hi' });
    server.rooms.onNew.emit({}, { text: 'hi' });

    expect(send).not.toHaveBeenCalled();
  });

  it('emits to every matching subscriber', () => {
    const server = createWsServer<any>();
    const registry = getWsServerRegistry(server)!;
    const sendA = jest.fn();
    const sendB = jest.fn();

    registry.register('messages', 'onNew', { roomId: 'general' }, sendA);
    registry.register('messages', 'onNew', { roomId: 'general' }, sendB);
    server.messages.onNew.emit({ roomId: 'general' }, { text: 'hi' });

    expect(sendA).toHaveBeenCalledWith({ text: 'hi' });
    expect(sendB).toHaveBeenCalledWith({ text: 'hi' });
  });

  it('stops emitting after the registration is unregistered', () => {
    const server = createWsServer<any>();
    const registry = getWsServerRegistry(server)!;
    const send = jest.fn();

    const unregister = registry.register('messages', 'onNew', { roomId: 'general' }, send);
    unregister();
    server.messages.onNew.emit({ roomId: 'general' }, { text: 'hi' });

    expect(send).not.toHaveBeenCalled();
  });

  it('matches undefined params only against undefined params', () => {
    const server = createWsServer<any>();
    const registry = getWsServerRegistry(server)!;
    const send = jest.fn();

    registry.register('ticks', 'onTick', undefined, send);
    server.ticks.onTick.emit(undefined, 1);

    expect(send).toHaveBeenCalledWith(1);
  });
});
