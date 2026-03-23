import { afterEach } from 'node:test';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OpClient } from '../client';
import { type MessageHandlers, transfer } from '../message';
import type { OpSchema } from '../types';

interface TestOps extends OpSchema {
  add: [{ a: number; b: number }, number];
  bin: [Uint8Array, Uint8Array];
  sub: [Uint8Array, number];
  init: [{ fastText?: boolean } | undefined, { ok: true }];
}

declare module 'vitest' {
  interface TestContext {
    producer: OpClient<TestOps>;
    handlers: MessageHandlers;
    postMessage: ReturnType<typeof vi.fn>;
  }
}

describe('op client', () => {
  beforeEach(ctx => {
    const { port1 } = new MessageChannel();
    // @ts-expect-error patch postMessage
    port1.postMessage = vi.fn(port1.postMessage);
    // @ts-expect-error patch postMessage
    ctx.postMessage = port1.postMessage;
    ctx.producer = new OpClient(port1, {
      timeout: 1000,
    });
    // @ts-expect-error internal api
    ctx.handlers = ctx.producer.handlers;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should send call op', async ctx => {
    // @ts-expect-error internal api
    const pendingCalls = ctx.producer.pendingCalls;
    const result = ctx.producer.call('add', { a: 1, b: 2 });

    expect(ctx.postMessage.mock.calls[0][0]).toMatchInlineSnapshot(`
      {
        "id": "add:1",
        "name": "add",
        "payload": {
          "a": 1,
          "b": 2,
        },
        "type": "call",
      }
    `);
    expect(pendingCalls.has('add:1')).toBe(true);

    // fake consumer return
    ctx.handlers.return({ type: 'return', id: 'add:1', data: 3 });

    await expect(result).resolves.toBe(3);

    expect(pendingCalls.has('add:1')).toBe(false);
  });

  it('should transfer transferables with call op', async ctx => {
    const data = new Uint8Array([1, 2, 3]);
    const result = ctx.producer.call('bin', transfer(data, [data.buffer]));

    expect(ctx.postMessage.mock.calls[0][1].transfer[0]).toBeInstanceOf(
      ArrayBuffer
    );

    // fake consumer return
    ctx.handlers.return({
      type: 'return',
      id: 'bin:1',
      data: new Uint8Array([3, 2, 1]),
    });

    await expect(result).resolves.toEqual(new Uint8Array([3, 2, 1]));
    expect(data.byteLength).toBe(0);
  });

  it('should send optional payload call with abort signal', async ctx => {
    const abortController = new AbortController();
    const result = ctx.producer.call(
      'init',
      { fastText: true },
      abortController.signal
    );

    expect(ctx.postMessage.mock.calls[0][0]).toMatchInlineSnapshot(`
      {
        "id": "init:1",
        "name": "init",
        "payload": {
          "fastText": true,
        },
        "type": "call",
      }
    `);

    ctx.handlers.return({
      type: 'return',
      id: 'init:1',
      data: { ok: true },
    });

    await expect(result).resolves.toEqual({ ok: true });
  });

  it('should send undefined payload for optional input call', async ctx => {
    const result = ctx.producer.call('init', undefined);

    expect(ctx.postMessage.mock.calls[0][0]).toMatchInlineSnapshot(`
      {
        "id": "init:1",
        "name": "init",
        "payload": undefined,
        "type": "call",
      }
    `);

    ctx.handlers.return({
      type: 'return',
      id: 'init:1',
      data: { ok: true },
    });

    await expect(result).resolves.toEqual({ ok: true });
  });

  it('should cancel call', async ctx => {
    const promise = ctx.producer.call('add', { a: 1, b: 2 });

    promise.cancel();

    expect(ctx.postMessage.mock.lastCall).toMatchInlineSnapshot(`
      [
        {
          "id": "add:1",
          "type": "cancel",
        },
      ]
    `);

    await expect(promise).rejects.toThrow('canceled');
  });

  it('should timeout call', async ctx => {
    const promise = ctx.producer.call('add', { a: 1, b: 2 });

    vi.advanceTimersByTime(4000);

    await expect(promise).rejects.toThrow('timeout');
  });

  it('should send subscribe op', async ctx => {
    let ob = {
      next: vi.fn(),
      error: vi.fn(),
      complete: vi.fn(),
    };

    // @ts-expect-error internal api
    const subscriptions = ctx.producer.obs;
    ctx.producer.ob$('sub', new Uint8Array([1, 2, 3])).subscribe(ob);

    expect(ctx.postMessage.mock.calls[0][0]).toMatchInlineSnapshot(`
      {
        "id": "sub:1",
        "name": "sub",
        "payload": Uint8Array [
          1,
          2,
          3,
        ],
        "type": "subscribe",
      }
    `);
    expect(subscriptions.has('sub:1')).toBe(true);

    // fake consumer return
    ctx.handlers.next({ type: 'next', id: 'sub:1', data: 1 });
    ctx.handlers.next({ type: 'next', id: 'sub:1', data: 2 });
    ctx.handlers.next({ type: 'next', id: 'sub:1', data: 3 });

    expect(subscriptions.has('sub:1')).toBe(true);

    ctx.handlers.complete({ type: 'complete', id: 'sub:1' });

    expect(ob.next).toHaveBeenCalledTimes(3);
    expect(ob.complete).toHaveBeenCalledTimes(1);

    expect(subscriptions.has('sub:1')).toBe(false);
    expect(ctx.postMessage.mock.lastCall).toMatchInlineSnapshot(`
      [
        {
          "id": "sub:1",
          "type": "unsubscribe",
        },
      ]
    `);

    // smoking
    ob = {
      next: vi.fn(),
      error: vi.fn(),
      complete: vi.fn(),
    };
    ctx.producer.ob$('sub', new Uint8Array([1, 2, 3])).subscribe(ob);

    expect(subscriptions.has('sub:2')).toBe(true);

    ctx.handlers.next({ type: 'next', id: 'sub:2', data: 1 });
    ctx.handlers.error({
      type: 'error',
      id: 'sub:2',
      error: new Error('test'),
    });

    expect(ob.next).toHaveBeenCalledTimes(1);
    expect(ob.error).toHaveBeenCalledTimes(1);

    expect(subscriptions.has('sub')).toBe(false);
  });

  it('should transfer transferables with subscribe op', async ctx => {
    const data = new Uint8Array([1, 2, 3]);
    const sub = ctx.producer
      .ob$('bin', transfer(data, [data.buffer]))
      .subscribe({
        next: vi.fn(),
      });

    expect(data.byteLength).toBe(0);

    sub.unsubscribe();
  });

  it('should unsubscribe subscription op', ctx => {
    const sub = ctx.producer.ob$('sub', new Uint8Array([1, 2, 3])).subscribe({
      next: vi.fn(),
    });

    sub.unsubscribe();

    expect(ctx.postMessage.mock.lastCall).toMatchInlineSnapshot(`
      [
        {
          "id": "sub:1",
          "type": "unsubscribe",
        },
      ]
    `);
  });
});
