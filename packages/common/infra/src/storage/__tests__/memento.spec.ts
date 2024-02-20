import { describe, expect, test } from 'vitest';

import { ServiceCollection } from '../../di';
import { GlobalCache, GlobalState, MemoryMemento } from '..';

describe('memento', () => {
  test('memory', () => {
    const memento = new MemoryMemento();

    expect(memento.get('foo')).toBeNull();
    memento.set('foo', 'bar');
    expect(memento.get('foo')).toEqual('bar');

    let subscribed = null;
    const subscription = memento.watch('foo').subscribe(v => {
      subscribed = v;
    });
    expect(subscribed).toEqual('bar');
    memento.set('foo', 'baz');
    expect(subscribed).toEqual('baz');

    subscription.unsubscribe();
    memento.set('foo', 'hello');
    expect(subscribed).toEqual('baz');
  });

  test('service', () => {
    const services = new ServiceCollection();

    services
      .addImpl(GlobalCache, MemoryMemento)
      .addImpl(GlobalState, MemoryMemento);

    const provider = services.provider();
    const cache = provider.get(GlobalCache);
    expect(cache).toBeInstanceOf(MemoryMemento);
    const state = provider.get(GlobalState);
    expect(state).toBeInstanceOf(MemoryMemento);
  });
});
