import { createWsServer } from '../ws-server';

describe('createWsServer', () => {
  it('delivers emitted data to a listener registered with deeply-equal params', async () => {
    const server = createWsServer<any>();
    const generator = server.messages.onNew.listen({ roomId: 'general' });

    const next = generator.next();
    server.messages.onNew.emit({ roomId: 'general' }, { text: 'hi' });

    expect((await next).value).toEqual({ text: 'hi' });
    await generator.return(undefined);
  });

  it('matches params regardless of key order', async () => {
    const server = createWsServer<any>();
    const generator = server.messages.onNew.listen({ a: 1, b: 2 });

    const next = generator.next();
    server.messages.onNew.emit({ b: 2, a: 1 }, 'hi');

    expect((await next).value).toBe('hi');
    await generator.return(undefined);
  });

  it('does not deliver to a listener with different params', async () => {
    const server = createWsServer<any>();
    const generator = server.messages.onNew.listen({ roomId: 'general' });

    const next = generator.next();
    server.messages.onNew.emit({ roomId: 'random' }, 'ignored');
    server.messages.onNew.emit({ roomId: 'general' }, 'match');

    expect((await next).value).toBe('match');
    await generator.return(undefined);
  });

  it('does not deliver to a different entity/operation', async () => {
    const server = createWsServer<any>();
    const generator = server.messages.onNew.listen({});

    const next = generator.next();
    server.messages.onEdit.emit({}, 'ignored');
    server.rooms.onNew.emit({}, 'ignored');
    server.messages.onNew.emit({}, 'match');

    expect((await next).value).toBe('match');
    await generator.return(undefined);
  });

  it('delivers to every active listener', async () => {
    const server = createWsServer<any>();
    const generatorA = server.messages.onNew.listen({ roomId: 'general' });
    const generatorB = server.messages.onNew.listen({ roomId: 'general' });

    const nextA = generatorA.next();
    const nextB = generatorB.next();
    server.messages.onNew.emit({ roomId: 'general' }, { text: 'hi' });

    expect((await nextA).value).toEqual({ text: 'hi' });
    expect((await nextB).value).toEqual({ text: 'hi' });
    await generatorA.return(undefined);
    await generatorB.return(undefined);
  });

  it('matches undefined params only against undefined params', async () => {
    const server = createWsServer<any>();
    const generator = server.ticks.onTick.listen(undefined);

    const next = generator.next();
    server.ticks.onTick.emit(undefined, 1);

    expect((await next).value).toBe(1);
    await generator.return(undefined);
  });

  it('stops yielding once the listener is returned', async () => {
    const server = createWsServer<any>();
    const generator = server.messages.onNew.listen({ roomId: 'general' });

    const first = generator.next();
    server.messages.onNew.emit({ roomId: 'general' }, 1);
    expect((await first).value).toBe(1);

    await generator.return(undefined);
    server.messages.onNew.emit({ roomId: 'general' }, 2);

    await expect(generator.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it('tears down immediately when its signal aborts, even on a channel with no further events', async () => {
    const server = createWsServer<any>();
    const controller = new AbortController();
    const generator = server.messages.onNew.listen({ roomId: 'quiet' }, controller.signal);

    const next = generator.next();
    controller.abort();

    await expect(next).resolves.toEqual({ value: undefined, done: true });
  });
});
