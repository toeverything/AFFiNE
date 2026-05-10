import test from 'ava';
import { z } from 'zod';

import type { CurrentUser } from '../../auth';
import { RealtimeGateway } from '../gateway';
import type { RealtimePublisher } from '../publisher';
import { RealtimeRegistry } from '../registry';
import { stableStringify } from '../stable-stringify';

const user: CurrentUser = {
  id: 'u1',
  email: 'u1@affine.pro',
  name: 'User',
  avatarUrl: null,
  disabled: false,
  hasPassword: true,
  emailVerified: true,
};

function createGateway(registry: RealtimeRegistry) {
  return new RealtimeGateway(registry, {
    attachServer() {},
    publishLocal() {},
  } as unknown as RealtimePublisher);
}

test('registry rejects duplicate request and topic handlers', t => {
  const registry = new RealtimeRegistry();
  const request = {
    name: 'notification.count.get' as const,
    input: z.object({}).strict(),
    handle: async () => ({ count: 0 }),
  };
  const topic = {
    name: 'notification.count.changed' as const,
    input: z.object({}).strict(),
    authorize: async () => {},
    room: () => 'room',
  };

  registry.registerRequest(request);
  registry.registerTopic(topic);

  t.throws(() => registry.registerRequest(request), {
    message: /already registered/,
  });
  t.throws(() => registry.registerTopic(topic), {
    message: /already registered/,
  });
});

test('gateway handles registered request with version gate', async t => {
  const registry = new RealtimeRegistry();
  registry.registerRequest({
    name: 'notification.count.get',
    input: z.object({}).strict(),
    handle: async currentUser => ({ count: currentUser.id === 'u1' ? 1 : 0 }),
  });
  const gateway = createGateway(registry);

  t.deepEqual(
    await gateway.onRequest(user, {
      op: 'notification.count.get',
      input: {},
      clientVersion: '0.26.0',
    }),
    { data: { count: 1 } }
  );
  t.like(
    await gateway.onRequest(user, {
      op: 'notification.count.get',
      input: {},
      clientVersion: '0.25.0',
    }),
    { error: { code: 'UNSUPPORTED_CLIENT_VERSION' } }
  );
});

test('gateway authorizes subscription and joins room', async t => {
  const registry = new RealtimeRegistry();
  registry.registerTopic({
    name: 'comment.changed',
    input: z.object({ workspaceId: z.string(), docId: z.string() }),
    authorize: async (_currentUser, input) => {
      if (input.workspaceId !== 'space') {
        throw new Error('denied');
      }
    },
    room: (_currentUser, input) => `workspace:${input.workspaceId}`,
  });
  const gateway = createGateway(registry);
  const joined: string[] = [];
  const client = {
    id: 'socket-1',
    join: async (room: string) => {
      joined.push(room);
    },
    leave: async (room: string) => {
      joined.splice(joined.indexOf(room), 1);
    },
  };

  const result = await gateway.onSubscribe(user, client as never, {
    topic: 'comment.changed',
    input: { workspaceId: 'space', docId: 'doc' },
    clientVersion: '0.26.0',
  });

  t.deepEqual(joined, ['workspace:space']);
  t.deepEqual(result, {
    data: {
      subscriptionId: `socket-1:comment.changed:${stableStringify({
        workspaceId: 'space',
        docId: 'doc',
      })}`,
    },
  });

  t.like(
    await gateway.onSubscribe(user, client as never, {
      topic: 'comment.changed',
      input: { workspaceId: 'other', docId: 'doc' },
      clientVersion: '0.26.0',
    }),
    { error: { code: 'INTERNAL_SERVER_ERROR' } }
  );
});

test('stableStringify is deterministic for subscription input keys', t => {
  t.is(
    stableStringify({ docId: 'doc', workspaceId: 'space' }),
    stableStringify({ workspaceId: 'space', docId: 'doc' })
  );
});

test('stableStringify follows JSON semantics for subscription input keys', t => {
  t.is(stableStringify({ after: undefined }), stableStringify({}));
  t.is(stableStringify([undefined]), '[null]');
  t.is(
    stableStringify(new Date('2026-01-02T03:04:05.000Z')),
    '"2026-01-02T03:04:05.000Z"'
  );
});

test('gateway removes subscriptions on socket disconnect', async t => {
  const registry = new RealtimeRegistry();
  registry.registerTopic({
    name: 'notification.count.changed',
    input: z.object({}).strict(),
    authorize: async () => {},
    room: () => 'user:u1:notification-count',
  });
  const gateway = createGateway(registry);
  const client = {
    id: 'socket-1',
    join: async () => {},
    leave: async () => {},
  };

  await gateway.onSubscribe(user, client as never, {
    topic: 'notification.count.changed',
    input: {},
    clientVersion: '0.26.0',
  });
  t.is((gateway as any).subscriptions.size, 1);

  gateway.handleDisconnect(client as never);

  t.is((gateway as any).subscriptions.size, 0);
});
