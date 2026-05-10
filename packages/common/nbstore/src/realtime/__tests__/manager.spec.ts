import { getRealtimeInputKey, type RealtimeEvent } from '@affine/realtime';
import { beforeEach, expect, test, vi } from 'vitest';

import { RealtimeManager } from '../manager';

type Handler = (payload?: unknown) => void;

class FakeSocket {
  readonly handlers = new Map<string, Handler>();
  readonly emitted: Array<{ event: string; payload: unknown }> = [];
  connected = true;
  disconnected = false;
  nextRequestAck: unknown = { data: { count: 1 } };
  subscribeAcks: unknown[] = [];
  nextSubscriptionId = 0;

  on(event: string, handler: Handler) {
    this.handlers.set(event, handler);
  }

  off(event: string) {
    this.handlers.delete(event);
  }

  async emitWithAck(event: string, payload: unknown) {
    this.emitted.push({ event, payload });
    if (event === 'realtime:subscribe') {
      const ack = this.subscribeAcks.shift();
      if (ack) return ack;
      this.nextSubscriptionId += 1;
      return { data: { subscriptionId: `sub-${this.nextSubscriptionId}` } };
    }
    if (event === 'realtime:request') {
      return this.nextRequestAck;
    }
    return { data: {} };
  }

  emit(event: string, payload?: unknown) {
    this.handlers.get(event)?.(payload);
  }
}

const socket = new FakeSocket();

vi.mock('../../impls/cloud/socket', () => ({
  SocketConnection: class {
    readonly inner = { socket };
    status = 'connected';
    readonly maybeConnection = { socket };

    connect() {}

    async waitForConnected() {}

    disconnect() {
      socket.disconnected = true;
    }
  },
}));

beforeEach(() => {
  vi.stubGlobal('BUILD_CONFIG', { appVersion: 'test' });
  socket.handlers.clear();
  socket.emitted.length = 0;
  socket.nextRequestAck = { data: { count: 1 } };
  socket.subscribeAcks = [];
  socket.nextSubscriptionId = 0;
  socket.connected = true;
  socket.disconnected = false;
});

test('getRealtimeInputKey is deterministic for realtime subscription inputs', () => {
  expect(getRealtimeInputKey({ workspaceId: 'space', docId: 'doc' })).toBe(
    getRealtimeInputKey({ docId: 'doc', workspaceId: 'space' })
  );
});

test('getRealtimeInputKey follows JSON semantics for edge values', () => {
  expect(getRealtimeInputKey({ a: undefined })).toBe(getRealtimeInputKey({}));
  expect(getRealtimeInputKey([undefined])).toBe('[null]');
  expect(getRealtimeInputKey(new Date('2026-01-02T03:04:05.000Z'))).toBe(
    '"2026-01-02T03:04:05.000Z"'
  );
});

test('request sends generic realtime request with client version', async () => {
  const manager = new RealtimeManager();
  manager.setContext({
    endpoint: 'http://server',
    isSelfHosted: false,
    authenticated: true,
  });

  await expect(manager.request('notification.count.get', {})).resolves.toEqual({
    count: 1,
  });

  expect(socket.emitted).toEqual([
    {
      event: 'realtime:request',
      payload: {
        op: 'notification.count.get',
        input: {},
        clientVersion: 'test',
      },
    },
  ]);
});

test('request rejects server ack error', async () => {
  const manager = new RealtimeManager();
  manager.setContext({
    endpoint: 'http://server',
    isSelfHosted: false,
    authenticated: true,
  });
  socket.nextRequestAck = {
    error: { name: 'Forbidden', message: 'No access' },
  };

  await expect(manager.request('notification.count.get', {})).rejects.toThrow(
    'No access'
  );
});

test('request rejects when aborted', async () => {
  const manager = new RealtimeManager();
  manager.setContext({
    endpoint: 'http://server',
    isSelfHosted: false,
    authenticated: true,
  });
  const controller = new AbortController();
  socket.nextRequestAck = new Promise(() => {});
  const request = manager.request(
    'notification.count.get',
    {},
    { signal: controller.signal }
  );

  controller.abort();

  await expect(request).rejects.toThrow('Realtime request aborted');
});

test('subscribe routes events by topic and stable input key', async () => {
  const manager = new RealtimeManager();
  manager.setContext({
    endpoint: 'http://server',
    isSelfHosted: false,
    authenticated: true,
  });
  const received: unknown[] = [];
  const subscription = manager
    .subscribe('comment.changed', { workspaceId: 'space', docId: 'doc' })
    .subscribe(event => received.push(event));
  await vi.waitFor(() => expect(received).toEqual([{ type: 'ready' }]));

  socket.emit('realtime:event', {
    topic: 'comment.changed',
    inputKey: getRealtimeInputKey({ workspaceId: 'space', docId: 'other' }),
    sentAt: 1,
    event: { changed: true },
  } satisfies RealtimeEvent);
  socket.emit('realtime:event', {
    topic: 'comment.changed',
    inputKey: getRealtimeInputKey({ workspaceId: 'space', docId: 'doc' }),
    sentAt: 2,
    event: { changed: true },
  } satisfies RealtimeEvent);

  expect(received).toEqual([{ type: 'ready' }, { changed: true }]);
  subscription.unsubscribe();
});

test('unsubscribe leaves server room and clears status', async () => {
  const manager = new RealtimeManager();
  manager.setContext({
    endpoint: 'http://server',
    isSelfHosted: false,
    authenticated: true,
  });
  const subscription = manager
    .subscribe('notification.count.changed', {})
    .subscribe();
  await vi.waitFor(() => expect(manager.getStatus().subscriptions).toBe(1));

  subscription.unsubscribe();

  expect(manager.getStatus()).toMatchObject({
    connected: true,
    subscriptions: 0,
  });
  expect(socket.emitted.at(-1)).toEqual({
    event: 'realtime:unsubscribe',
    payload: {
      subscriptionId: 'sub-1',
      topic: 'notification.count.changed',
      input: {},
      clientVersion: 'test',
    },
  });
});

test('context switch disconnects socket and completes subscriptions', async () => {
  const manager = new RealtimeManager();
  manager.setContext({
    endpoint: 'http://server',
    isSelfHosted: false,
    authenticated: true,
  });
  const completed = vi.fn();
  manager
    .subscribe('notification.count.changed', {})
    .subscribe({ complete: completed });
  await vi.waitFor(() => expect(manager.getStatus().subscriptions).toBe(1));

  manager.setContext({
    endpoint: 'http://other-server',
    isSelfHosted: false,
    authenticated: true,
  });

  expect(socket.disconnected).toBe(true);
  expect(completed).toHaveBeenCalled();
  expect(manager.getStatus()).toMatchObject({
    endpoint: 'http://other-server',
    connected: false,
    subscriptions: 0,
  });
});

test('subscribe registers server room again after reconnect', async () => {
  const manager = new RealtimeManager();
  manager.setContext({
    endpoint: 'http://server',
    isSelfHosted: false,
    authenticated: true,
  });
  const received: unknown[] = [];
  const subscription = manager
    .subscribe('notification.count.changed', {})
    .subscribe(event => received.push(event));
  await vi.waitFor(() => expect(received).toEqual([{ type: 'ready' }]));

  socket.emit('connect');

  await vi.waitFor(() =>
    expect(
      socket.emitted.filter(item => item.event === 'realtime:subscribe')
    ).toHaveLength(2)
  );
  expect(received).toEqual([{ type: 'ready' }, { type: 'ready' }]);
  subscription.unsubscribe();
});

test('failed reconnect only errors the affected subscription', async () => {
  const manager = new RealtimeManager();
  manager.setContext({
    endpoint: 'http://server',
    isSelfHosted: false,
    authenticated: true,
  });
  const first: unknown[] = [];
  const firstErrors: unknown[] = [];
  const second: unknown[] = [];
  const secondErrors: unknown[] = [];
  const firstSubscription = manager
    .subscribe('notification.count.changed', {})
    .subscribe({
      next: event => first.push(event),
      error: error => firstErrors.push(error),
    });
  const secondSubscription = manager
    .subscribe('comment.changed', { workspaceId: 'space', docId: 'doc' })
    .subscribe({
      next: event => second.push(event),
      error: error => secondErrors.push(error),
    });
  await vi.waitFor(() => expect(manager.getStatus().subscriptions).toBe(2));

  socket.subscribeAcks = [
    { data: { subscriptionId: 'resub-1' } },
    { error: { name: 'Forbidden', message: 'No access' } },
  ];
  socket.emit('connect');

  await vi.waitFor(() => expect(first).toHaveLength(2));
  await vi.waitFor(() => expect(secondErrors).toHaveLength(1));
  expect(firstErrors).toEqual([]);
  expect(manager.getStatus().subscriptions).toBe(1);

  firstSubscription.unsubscribe();
  secondSubscription.unsubscribe();
});
