import {
  getRealtimeInputKey,
  type RealtimeEvent,
  type RealtimeSubscribeEnvelope,
} from '@affine/realtime';
import { beforeEach, expect, test, vi } from 'vitest';

import { RealtimeManager } from '../manager';

type Handler = (payload?: unknown) => void;

class FakeSocket {
  readonly handlers = new Map<string, Handler[]>();
  readonly emitted: Array<{ event: string; payload: unknown }> = [];
  readonly subscriptions = new Map<
    string,
    { socketId: string; topic: string; inputKey: string }
  >();
  readonly pending = new Set<(error: Error) => void>();
  connected = true;
  disconnected = false;
  shared = false;
  nextRequestAck: unknown = { data: { count: 1 } };
  subscribeAcks: unknown[] = [];
  unsubscribeAcks: unknown[] = [];
  private connectionId = 1;
  id: string;

  constructor(private readonly endpoint: string) {
    this.id = `${endpoint}:client-${this.connectionId}`;
  }

  subscriptionId(topic: string, input: unknown) {
    return `${this.id}:${topic}:${getRealtimeInputKey(input)}`;
  }
  ackRejections = 0;

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  }

  off(event: string, handler: Handler) {
    this.handlers.set(
      event,
      (this.handlers.get(event) ?? []).filter(current => current !== handler)
    );
  }

  emitWithAck(event: string, payload: unknown) {
    this.emitted.push({ event, payload });
    const socketId = this.id;
    const ack =
      event === 'realtime:subscribe'
        ? (this.subscribeAcks.shift() ?? { data: {} })
        : event === 'realtime:unsubscribe'
          ? (this.unsubscribeAcks.shift() ?? { data: { ok: true } })
          : this.nextRequestAck;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.add(reject);
      Promise.resolve(ack).then(
        result => {
          if (!this.pending.delete(reject)) return;
          if (
            event === 'realtime:subscribe' &&
            !(result && typeof result === 'object' && 'error' in result)
          ) {
            const envelope = payload as RealtimeSubscribeEnvelope;
            const inputKey = getRealtimeInputKey(envelope.input);
            const subscriptionId = `${socketId}:${envelope.topic}:${inputKey}`;
            this.subscriptions.set(subscriptionId, {
              socketId,
              topic: envelope.topic,
              inputKey,
            });
            resolve({ data: { subscriptionId } });
            return;
          } else if (event === 'realtime:unsubscribe') {
            const id = (payload as { subscriptionId: string }).subscriptionId;
            if (this.subscriptions.get(id)?.socketId === socketId)
              this.subscriptions.delete(id);
          }
          resolve(result);
        },
        error => {
          this.pending.delete(reject);
          reject(error);
        }
      );
    });
  }

  disconnect() {
    this.connected = false;
    this.disconnected = true;
    this.subscriptions.clear();
    this.emit('disconnect', 'transport close');
    for (const reject of this.pending) {
      this.ackRejections++;
      reject(new Error('socket has been disconnected'));
    }
    this.pending.clear();
  }

  reconnect() {
    this.id = `${this.endpoint}:client-${++this.connectionId}`;
    this.connected = true;
    this.emit('connect');
  }

  publish(event: RealtimeEvent) {
    if (
      Array.from(this.subscriptions.values()).some(
        subscription =>
          subscription.topic === event.topic &&
          subscription.inputKey === event.inputKey
      )
    )
      this.emit('realtime:event', event);
  }

  emit(event: string, payload?: unknown) {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(payload);
    }
  }
}

const { resetSharedConnection, waitForConnected } = vi.hoisted(() => ({
  resetSharedConnection: vi.fn(),
  waitForConnected: vi.fn(async (_signal?: AbortSignal) => {}),
}));
let socket: FakeSocket;
const sockets = new Map<string, FakeSocket>();
const getSocket = (endpoint: string) => {
  let socket = sockets.get(endpoint);
  if (!socket) {
    socket = new FakeSocket(endpoint);
    sockets.set(endpoint, socket);
  }
  return socket;
};

vi.mock('../../impls/cloud/socket', () => ({
  SocketConnection: class {
    static resetSharedConnection = resetSharedConnection;

    readonly inner: { socket: FakeSocket };
    closed = false;

    constructor(endpoint: string) {
      this.inner = { socket: getSocket(endpoint) };
    }

    get status() {
      return this.closed
        ? 'closed'
        : this.inner.socket.connected
          ? 'connected'
          : 'connecting';
    }

    get maybeConnection() {
      return this.inner.socket.connected ? this.inner : undefined;
    }

    connect() {}

    async waitForConnected(signal?: AbortSignal) {
      await waitForConnected(signal);
      if (this.inner.socket.connected) return;
      await new Promise<void>((resolve, reject) => {
        const onConnect = () => {
          cleanup();
          resolve();
        };
        const onAbort = () => {
          cleanup();
          reject(signal?.reason);
        };
        const cleanup = () => {
          this.inner.socket.off('connect', onConnect);
          signal?.removeEventListener('abort', onAbort);
        };
        this.inner.socket.on('connect', onConnect);
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
      });
    }

    disconnect() {
      this.closed = true;
      this.inner.socket.disconnected = true;
      if (!this.inner.socket.shared) this.inner.socket.disconnect();
    }
  },
}));

beforeEach(() => {
  vi.stubGlobal('BUILD_CONFIG', { appVersion: 'test' });
  sockets.clear();
  socket = getSocket('http://server');
  resetSharedConnection.mockClear();
  waitForConnected.mockReset();
  waitForConnected.mockResolvedValue(undefined);
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

test('user profile request can bootstrap without authenticated context', async () => {
  const manager = new RealtimeManager();
  manager.setContext({
    endpoint: 'http://server',
    isSelfHosted: false,
    authenticated: false,
  });
  socket.nextRequestAck = { data: { user: null } };

  await expect(manager.request('user.profile.get', {})).resolves.toEqual({
    user: null,
  });
  socket.disconnect();
  socket.reconnect();
  await expect(manager.request('user.profile.get', {})).resolves.toEqual({
    user: null,
  });
  expect(manager.getStatus().lastError).toBeUndefined();
});

test('non-bootstrap request still requires authenticated context', async () => {
  const manager = new RealtimeManager();
  manager.setContext({
    endpoint: 'http://server',
    isSelfHosted: false,
    authenticated: false,
  });

  await expect(manager.request('notification.count.get', {})).rejects.toThrow(
    'Realtime is not authenticated'
  );
});

test('request rejects when connection times out or is aborted', async () => {
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

  waitForConnected.mockImplementationOnce(() => new Promise(() => {}));
  await expect(
    manager.request('notification.count.get', {}, { timeoutMs: 1 })
  ).rejects.toMatchObject({
    name: 'RealtimeRequestTimeout',
    message: 'Realtime request timed out: notification.count.get',
  });
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

  socket.publish({
    topic: 'comment.changed',
    inputKey: getRealtimeInputKey({ workspaceId: 'space', docId: 'other' }),
    sentAt: 1,
    event: { changed: true },
  } satisfies RealtimeEvent);
  socket.publish({
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
      subscriptionId: socket.subscriptionId('notification.count.changed', {}),
      topic: 'notification.count.changed',
      input: {},
      clientVersion: 'test',
    },
  });
});

test.each([
  { phase: 'connecting', shared: false },
  { phase: 'initial', shared: false },
  { phase: 'initial', shared: true },
  { phase: 'restore', shared: false },
  { phase: 'restore', shared: true },
])(
  'context switch preserves subscriptions during $phase (shared socket: $shared)',
  async ({ phase, shared }) => {
    const manager = new RealtimeManager();
    const context = {
      endpoint: 'http://server',
      isSelfHosted: false,
      authenticated: true,
    };
    manager.setContext(context);
    const pending = Promise.withResolvers<unknown>();
    const nextPending = Promise.withResolvers<unknown>();
    const completed = vi.fn();
    const errors = vi.fn();
    const received: unknown[][] = [[], []];
    if (phase === 'connecting') socket.connected = false;
    if (phase === 'initial') socket.subscribeAcks = [pending.promise];
    const subscriptions = received.map((events, index) =>
      manager
        .subscribe('comment.changed', {
          workspaceId: 'space',
          docId: `doc-${index}`,
        })
        .subscribe({
          next: event => events.push(event),
          error: errors,
          complete: completed,
        })
    );
    let oldSocket = socket;
    let oldRequest: Promise<unknown> = Promise.resolve();
    if (phase === 'restore') {
      await vi.waitFor(() => expect(manager.getStatus().subscriptions).toBe(2));
      manager.setContext({ ...context, endpoint: 'http://restore' });
      oldSocket = getSocket('http://restore');
      oldSocket.subscribeAcks = [
        { data: { subscriptionId: 'restored-first' } },
        pending.promise,
      ];
      oldRequest = manager.request('notification.count.get', {});
    }
    if (phase === 'connecting') {
      await vi.waitFor(() => expect(waitForConnected).toHaveBeenCalled());
    } else {
      await vi.waitFor(() =>
        expect(
          oldSocket.emitted.filter(item => item.event === 'realtime:subscribe')
        ).toHaveLength(2)
      );
    }

    oldSocket.shared = shared;
    manager.setContext({ ...context, endpoint: 'http://other-server' });
    const nextSocket = getSocket('http://other-server');
    nextSocket.subscribeAcks = [nextPending.promise];
    const request = manager.request('notification.count.get', {});
    await vi.waitFor(() =>
      expect(
        nextSocket.emitted.filter(item => item.event === 'realtime:subscribe')
      ).toHaveLength(2)
    );
    expect(oldSocket.disconnected).toBe(true);
    if (!shared && phase !== 'connecting') {
      expect(oldSocket.ackRejections).toBeGreaterThanOrEqual(1);
    } else {
      expect(oldSocket.ackRejections).toBe(0);
    }

    pending.resolve({ data: { subscriptionId: 'late-old-subscription' } });
    await vi.waitFor(() => expect(oldSocket.pending.size).toBe(0));
    const concurrentRequest = manager.request('notification.count.get', {});
    await vi.waitFor(() =>
      expect(waitForConnected.mock.calls.length).toBeGreaterThan(3)
    );
    expect(
      nextSocket.emitted.filter(item => item.event === 'realtime:subscribe')
    ).toHaveLength(2);
    nextPending.resolve({ data: { subscriptionId: 'next-first' } });
    await Promise.all([request, concurrentRequest, oldRequest]);
    await vi.waitFor(() =>
      expect(received.map(events => events.length)).toEqual(
        phase === 'restore' ? [3, 2] : phase === 'initial' ? [1, 2] : [1, 1]
      )
    );

    expect(manager.getStatus()).toMatchObject({
      endpoint: 'http://other-server',
      connected: true,
      subscriptions: 2,
    });
    expect(nextSocket.subscriptions.size).toBe(2);
    expect(
      nextSocket.emitted.filter(item => item.event === 'realtime:subscribe')
    ).toHaveLength(2);
    expect(oldSocket.subscriptions.size).toBe(0);
    expect(received.map(events => events.length)).toEqual(
      phase === 'restore' ? [3, 2] : phase === 'initial' ? [1, 2] : [1, 1]
    );
    expect(errors).not.toHaveBeenCalled();
    expect(completed).not.toHaveBeenCalled();
    subscriptions.forEach(subscription => subscription.unsubscribe());
    await vi.waitFor(() => expect(nextSocket.subscriptions.size).toBe(0));
    expect(manager.getStatus().subscriptions).toBe(0);
  }
);

test.each(['old-first', 'new-first', 'cancel-before-old'])(
  'shared socket context round trip preserves its deterministic room (%s)',
  async order => {
    const manager = new RealtimeManager();
    const context = {
      endpoint: 'http://server',
      isSelfHosted: false,
      authenticated: true,
    };
    manager.setContext(context);
    socket.shared = true;
    const old = Promise.withResolvers<unknown>();
    const next = Promise.withResolvers<unknown>();
    socket.subscribeAcks = [old.promise];
    const received: unknown[] = [];
    const subscription = manager
      .subscribe('notification.count.changed', {})
      .subscribe(event => received.push(event));
    await vi.waitFor(() => expect(socket.pending.size).toBe(1));
    manager.setContext({ ...context, endpoint: 'http://other-server' });
    await manager.request('notification.count.get', {});
    await vi.waitFor(() => expect(received).toHaveLength(1));
    socket.subscribeAcks = [next.promise];
    manager.setContext(context);
    await manager.request('notification.count.get', {});
    await vi.waitFor(() => expect(socket.pending.size).toBe(2));
    expect(manager.getStatus().subscriptions).toBe(0);
    if (order === 'old-first') {
      old.resolve({ data: {} });
      await vi.waitFor(() => expect(socket.pending.size).toBe(1));
      expect(socket.subscriptions.size).toBe(1);
      expect(manager.getStatus().subscriptions).toBe(0);
    }
    next.resolve({ data: {} });
    await vi.waitFor(() => expect(received).toHaveLength(2));
    expect(manager.getStatus().subscriptions).toBe(1);
    if (order === 'cancel-before-old') {
      subscription.unsubscribe();
      await vi.waitFor(() => expect(socket.subscriptions.size).toBe(0));
    }
    old.resolve({ data: {} });
    await vi.waitFor(() => expect(socket.pending.size).toBe(0));
    expect(socket.subscriptions.size).toBe(
      order === 'cancel-before-old' ? 0 : 1
    );
    socket.publish({
      topic: 'notification.count.changed',
      inputKey: getRealtimeInputKey({}),
      sentAt: 1,
      event: { count: 2, reason: 'resync' },
    });
    expect(received).toEqual(
      order === 'cancel-before-old'
        ? [{ type: 'ready' }, { type: 'ready' }]
        : [{ type: 'ready' }, { type: 'ready' }, { count: 2, reason: 'resync' }]
    );
    subscription.unsubscribe();
    await vi.waitFor(() => expect(socket.subscriptions.size).toBe(0));
    expect(manager.getStatus().subscriptions).toBe(0);
  }
);

test.each([false, true])(
  'shares a deterministic room across consumers (separate managers: %s)',
  async separate => {
    const firstManager = new RealtimeManager();
    const secondManager = separate ? new RealtimeManager() : firstManager;
    const context = {
      endpoint: 'http://server',
      isSelfHosted: false,
      authenticated: true,
    };
    firstManager.setContext(context);
    secondManager.setContext(context);
    const first: unknown[] = [];
    const second: unknown[] = [];
    const input = { workspaceId: 'space' };
    const firstSubscription = firstManager
      .subscribe('workspace.members.changed', input)
      .subscribe(event => first.push(event));
    const secondSubscription = secondManager
      .subscribe('workspace.members.changed', input)
      .subscribe(event => second.push(event));
    await vi.waitFor(() =>
      expect([first.length, second.length]).toEqual([1, 1])
    );
    expect(socket.subscriptions.size).toBe(1);
    expect(
      socket.emitted.filter(item => item.event === 'realtime:subscribe')
    ).toHaveLength(separate ? 2 : 1);
    firstSubscription.unsubscribe();
    expect(socket.subscriptions.size).toBe(1);
    socket.publish({
      topic: 'workspace.members.changed',
      inputKey: getRealtimeInputKey(input),
      sentAt: 1,
      event: { changed: true, reason: 'member-added' },
    });
    expect(first).toEqual([{ type: 'ready' }]);
    expect(second).toEqual([
      { type: 'ready' },
      { changed: true, reason: 'member-added' },
    ]);
    secondSubscription.unsubscribe();
    await vi.waitFor(() => expect(socket.subscriptions.size).toBe(0));
    expect(firstManager.getStatus().subscriptions).toBe(0);
    expect(secondManager.getStatus().subscriptions).toBe(0);
  }
);

test('reacquiring a room waits for its pending leave before joining again', async () => {
  const manager = new RealtimeManager();
  const context = {
    endpoint: 'http://server',
    isSelfHosted: false,
    authenticated: true,
  };
  manager.setContext(context);
  socket.shared = true;
  const received: unknown[] = [];
  const subscription = manager
    .subscribe('notification.count.changed', {})
    .subscribe(event => received.push(event));
  await vi.waitFor(() => expect(received).toHaveLength(1));
  const leave = Promise.withResolvers<unknown>();
  socket.unsubscribeAcks = [leave.promise];
  manager.setContext({ ...context, endpoint: 'http://other-server' });
  await manager.request('notification.count.get', {});
  await vi.waitFor(() => expect(received).toHaveLength(2));
  manager.setContext(context);
  await manager.request('notification.count.get', {});
  expect(manager.getStatus().subscriptions).toBe(0);
  expect(
    socket.emitted.filter(item => item.event === 'realtime:subscribe')
  ).toHaveLength(1);
  leave.resolve({ data: { ok: true } });
  await vi.waitFor(() => expect(received).toHaveLength(3));
  expect(
    socket.emitted.filter(item => item.event === 'realtime:subscribe')
  ).toHaveLength(2);
  expect(socket.subscriptions.size).toBe(1);
  socket.publish({
    topic: 'notification.count.changed',
    inputKey: getRealtimeInputKey({}),
    sentAt: 1,
    event: { count: 3, reason: 'resync' },
  });
  expect(received.at(-1)).toEqual({ count: 3, reason: 'resync' });
  subscription.unsubscribe();
  await vi.waitFor(() => expect(socket.subscriptions.size).toBe(0));
});

test('pending subscription ACK does not block another topic or ordinary requests', async () => {
  const manager = new RealtimeManager();
  manager.setContext({
    endpoint: 'http://server',
    isSelfHosted: false,
    authenticated: true,
  });
  const pending = Promise.withResolvers<unknown>();
  socket.subscribeAcks = [pending.promise];
  const first = manager.subscribe('notification.count.changed', {}).subscribe();
  await vi.waitFor(() => expect(socket.pending.size).toBe(1));
  const received: unknown[] = [];
  const input = { workspaceId: 'space', docId: 'doc' };
  const second = manager
    .subscribe('comment.changed', input)
    .subscribe(event => received.push(event));
  await expect(manager.request('notification.count.get', {})).resolves.toEqual({
    count: 1,
  });
  await vi.waitFor(() => expect(received).toHaveLength(1));
  expect(manager.getStatus().subscriptions).toBe(1);
  socket.publish({
    topic: 'comment.changed',
    inputKey: getRealtimeInputKey(input),
    sentAt: 1,
    event: { changed: true },
  });
  expect(received.at(-1)).toEqual({ changed: true });
  first.unsubscribe();
  pending.resolve({ data: {} });
  await vi.waitFor(() => expect(socket.pending.size).toBe(0));
  expect(socket.subscriptions.size).toBe(1);
  second.unsubscribe();
  await vi.waitFor(() => expect(socket.subscriptions.size).toBe(0));
});

test('auth context switch resets shared socket connection', () => {
  const manager = new RealtimeManager();
  manager.setContext({
    endpoint: 'http://server',
    isSelfHosted: false,
    authenticated: true,
  });

  manager.setContext({
    endpoint: 'http://server',
    isSelfHosted: false,
    authenticated: false,
  });

  expect(resetSharedConnection).toHaveBeenCalledWith('http://server', false);
});

test.each([
  { transition: 'context', requestOnReady: false },
  { transition: 'context', requestOnReady: true },
  { transition: 'reconnect', requestOnReady: false },
  { transition: 'reconnect', requestOnReady: true },
])(
  '$transition restores each subscription once (request on ready: $requestOnReady)',
  async ({ transition, requestOnReady }) => {
    const manager = new RealtimeManager();
    manager.setContext({
      endpoint: 'http://server',
      isSelfHosted: false,
      authenticated: true,
    });
    const ready = vi.fn();
    const errors = vi.fn();
    const requests: Promise<unknown>[] = [];
    const subscriptions = Array.from({ length: 8 }, (_, index) =>
      manager
        .subscribe('comment.changed', {
          workspaceId: 'space',
          docId: `doc-${index}`,
        })
        .subscribe({
          next: event => {
            if ('type' in event) {
              ready();
              if (requestOnReady) {
                requests.push(manager.request('notification.count.get', {}));
              }
            }
          },
          error: errors,
        })
    );
    await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(8));
    if (transition === 'context') {
      manager.setContext({
        endpoint: 'http://other-server',
        isSelfHosted: false,
        authenticated: true,
      });
    } else {
      socket.disconnect();
      socket.reconnect();
    }
    await Promise.all([
      manager.request('notification.count.get', {}),
      manager.request('notification.count.get', {}),
    ]);
    await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(16));
    await Promise.all(requests);
    expect(
      Array.from(sockets.values()).flatMap(socket =>
        socket.emitted.filter(item => item.event === 'realtime:subscribe')
      )
    ).toHaveLength(16);
    expect(manager.getStatus().subscriptions).toBe(8);
    expect(errors).not.toHaveBeenCalled();
    subscriptions.forEach(subscription => subscription.unsubscribe());
    await vi.waitFor(() =>
      expect(
        Array.from(sockets.values()).every(
          socket => socket.subscriptions.size === 0
        )
      ).toBe(true)
    );
    expect(manager.getStatus().subscriptions).toBe(0);
  }
);

test.each(['ready', 'initial-ack', 'restore-ack'])(
  'unsubscribe releases server subscription during %s',
  async phase => {
    const manager = new RealtimeManager();
    const context = {
      endpoint: 'http://server',
      isSelfHosted: false,
      authenticated: true,
    };
    manager.setContext(context);
    const pending = Promise.withResolvers<unknown>();
    const received = vi.fn();
    const errors = vi.fn();
    if (phase === 'initial-ack') socket.subscribeAcks = [pending.promise];
    const subscription = manager
      .subscribe('notification.count.changed', {})
      .subscribe({ next: received, error: errors });
    let activeSocket = socket;
    if (phase === 'initial-ack') {
      await vi.waitFor(() => expect(socket.pending.size).toBe(1));
    } else {
      await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
      manager.setContext({ ...context, endpoint: 'http://other-server' });
      activeSocket = getSocket('http://other-server');
      if (phase === 'restore-ack')
        activeSocket.subscribeAcks = [pending.promise];
    }
    const request = manager.request('notification.count.get', {});
    if (phase === 'restore-ack') {
      await vi.waitFor(() => expect(activeSocket.pending.size).toBe(1));
    } else if (phase === 'ready') {
      await request;
      await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(2));
    }
    const readyBeforeUnsubscribe = received.mock.calls.length;
    subscription.unsubscribe();
    pending.resolve({ data: { subscriptionId: 'pending-subscription' } });
    await request;

    expect(manager.getStatus().subscriptions).toBe(0);
    await vi.waitFor(() => expect(activeSocket.subscriptions.size).toBe(0));
    expect(activeSocket.emitted).toContainEqual({
      event: 'realtime:unsubscribe',
      payload: {
        subscriptionId: activeSocket.subscriptionId(
          'notification.count.changed',
          {}
        ),
        topic: 'notification.count.changed',
        input: {},
        clientVersion: 'test',
      },
    });
    expect(received).toHaveBeenCalledTimes(readyBeforeUnsubscribe);
    expect(errors).not.toHaveBeenCalled();
  }
);

test.each(['ready', 'initial-ack', 'restore-ack'])(
  'subscribe recovers after disconnect during %s',
  async phase => {
    const manager = new RealtimeManager();
    manager.setContext({
      endpoint: 'http://server',
      isSelfHosted: false,
      authenticated: true,
    });
    const pending = Promise.withResolvers<unknown>();
    if (phase === 'initial-ack') socket.subscribeAcks = [pending.promise];
    const received: unknown[] = [];
    const errors = vi.fn();
    const subscription = manager
      .subscribe('notification.count.changed', {})
      .subscribe({ next: event => received.push(event), error: errors });
    if (phase === 'initial-ack') {
      await vi.waitFor(() => expect(socket.pending.size).toBe(1));
    } else {
      await vi.waitFor(() => expect(received).toEqual([{ type: 'ready' }]));
    }
    if (phase === 'restore-ack') {
      socket.subscribeAcks = [pending.promise];
      socket.disconnect();
      socket.reconnect();
      await vi.waitFor(() => expect(socket.pending.size).toBe(1));
    }

    socket.disconnect();
    socket.reconnect();
    await manager.request('notification.count.get', {});
    await vi.waitFor(() =>
      expect(received).toHaveLength(phase === 'initial-ack' ? 1 : 2)
    );

    expect(
      socket.emitted.filter(item => item.event === 'realtime:subscribe')
    ).toHaveLength(phase === 'restore-ack' ? 3 : 2);
    expect(socket.ackRejections).toBe(phase === 'ready' ? 0 : 1);
    expect(received).toEqual(
      Array.from({ length: phase === 'initial-ack' ? 1 : 2 }, () => ({
        type: 'ready',
      }))
    );
    expect(errors).not.toHaveBeenCalled();
    expect(manager.getStatus().subscriptions).toBe(1);
    expect(socket.subscriptions.size).toBe(1);
    subscription.unsubscribe();
    await vi.waitFor(() => expect(socket.subscriptions.size).toBe(0));
  }
);

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
  socket.disconnect();
  socket.reconnect();

  await vi.waitFor(() => expect(first).toHaveLength(2));
  await vi.waitFor(() => expect(secondErrors).toHaveLength(1));
  expect(firstErrors).toEqual([]);
  expect(manager.getStatus().subscriptions).toBe(1);

  firstSubscription.unsubscribe();
  secondSubscription.unsubscribe();
});
