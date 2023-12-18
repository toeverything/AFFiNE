import { describe, expect, test } from 'vitest';

import {
  CircularDependencyError,
  MissingDependencyError,
  RecursionLimitError,
  ServiceCollection,
  ServiceNotFoundError,
} from '../di';

describe('di', () => {
  test('basic', () => {
    const serviceCollection = new ServiceCollection();
    serviceCollection.add('test-service', { a: 'b' });

    const provider = serviceCollection.provider();
    expect(provider.resolve('test-service')).toEqual({ a: 'b' });
  });

  test('factory', () => {
    const serviceCollection = new ServiceCollection();
    serviceCollection.addFactory('test', () => ({ a: 'b' }));

    const provider = serviceCollection.provider();
    expect(provider.resolve('test')).toEqual({ a: 'b' });
  });

  test('class type', () => {
    class TestClass {
      constructor(public readonly foo: string) {}
    }

    {
      const serviceCollection = new ServiceCollection();
      serviceCollection.add(TestClass, new TestClass('bar'));

      const provider = serviceCollection.provider();
      expect(provider.resolve(TestClass).foo).toEqual('bar');
    }

    {
      const serviceCollection = new ServiceCollection();
      serviceCollection.addFactory(TestClass, () => new TestClass('bar'));

      const provider = serviceCollection.provider();
      expect(provider.resolve(TestClass).foo).toEqual('bar');
    }
  });

  test('dependency', () => {
    const serviceCollection = new ServiceCollection();

    // a depends on b
    serviceCollection.addFactory('serviceA', provider => ({
      b: provider.resolve('serviceB'),
    }));

    // b depends on c
    serviceCollection.addFactory('serviceB', provider => ({
      c: provider.resolve('serviceC'),
    }));

    serviceCollection.add('serviceC', {
      final: 'i am c',
    });

    const provider = serviceCollection.provider();
    expect(provider.resolve('serviceA').b.c.final).toEqual('i am c');
  });

  test('service not found', () => {
    const serviceCollection = new ServiceCollection();

    const provider = serviceCollection.provider();
    expect(() => provider.resolve('serviceA')).toThrowError(
      ServiceNotFoundError
    );
  });

  test('missing dependency', () => {
    const serviceCollection = new ServiceCollection();

    // a depends on b
    serviceCollection.addFactory('serviceA', provider => ({
      b: provider.resolve('serviceB'),
    }));

    const provider = serviceCollection.provider();
    expect(() => provider.resolve('serviceA')).toThrowError(
      MissingDependencyError
    );
  });

  test('circular dependency', () => {
    const serviceCollection = new ServiceCollection();

    // a depends on b
    serviceCollection.addFactory('serviceA', provider => ({
      b: provider.resolve('serviceB'),
    }));

    // b depends on c
    serviceCollection.addFactory('serviceB', provider => ({
      c: provider.resolve('serviceC'),
    }));

    // c depends on a
    serviceCollection.addFactory('serviceC', provider => ({
      a: provider.resolve('serviceA'),
    }));

    const provider = serviceCollection.provider();
    expect(() => provider.resolve('serviceA')).toThrowError(
      CircularDependencyError
    );
    expect(() => provider.resolve('serviceB')).toThrowError(
      CircularDependencyError
    );
    expect(() => provider.resolve('serviceC')).toThrowError(
      CircularDependencyError
    );
  });

  test('recursion limit', () => {
    // maxmium resolve depth is 100
    const serviceCollection = new ServiceCollection();
    let i = 0;
    for (; i < 100; i++) {
      const next = i + 1;
      serviceCollection.addFactory(
        'test',
        provider => provider.resolve('test', next.toString()),
        i.toString()
      );
    }
    serviceCollection.add('test', { a: 'b' }, i.toString());
    const provider = serviceCollection.provider();
    expect(() => provider.resolve('test', '0')).toThrowError(
      RecursionLimitError
    );
  });

  test('variant', () => {
    const serviceCollection = new ServiceCollection();
    serviceCollection.add('test-service', { a: 'i am A' }, 'typeA');
    serviceCollection.add('test-service', { b: 'i am B' }, 'typeB');

    const provider = serviceCollection.provider();
    expect(provider.resolve('test-service', 'typeA')).toEqual({ a: 'i am A' });
    expect(provider.resolve('test-service', 'typeB')).toEqual({ b: 'i am B' });
  });

  test('duplicate, override', () => {
    const serviceCollection = new ServiceCollection();
    serviceCollection.add('test-service', { a: 'i am A' });
    serviceCollection.add('test-service', { b: 'i am B' });

    const provider = serviceCollection.provider();
    expect(provider.resolve('test-service')).toEqual({ b: 'i am B' });
  });
});
