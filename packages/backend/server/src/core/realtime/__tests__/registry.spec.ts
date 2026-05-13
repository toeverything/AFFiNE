import { getRealtimeInputKey } from '@affine/realtime';
import test from 'ava';
import { z } from 'zod';

import type { CopilotTranscriptionReader } from '../../../plugins/copilot/transcript';
import { CopilotTranscriptRealtimeProvider } from '../../../plugins/copilot/transcript';
import type { CurrentUser } from '../../auth';
import { CommentRealtimeProvider } from '../../comment/realtime';
import { NotificationRealtimeProvider } from '../../notification/realtime';
import type { AccessController } from '../../permission';
import { RealtimeGateway } from '../gateway';
import {
  realtimeCommentRoom,
  realtimeNotificationRoom,
  realtimeTranscriptTaskRoom,
  realtimeWorkspaceEmbeddingProgressRoom,
  registerRealtimeLiveQuery,
} from '../index';
import { RealtimePublisher } from '../publisher';
import { RealtimeRegistry } from '../registry';

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
      subscriptionId: `socket-1:comment.changed:${getRealtimeInputKey({
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

test('getRealtimeInputKey is deterministic for subscription input keys', t => {
  t.is(
    getRealtimeInputKey({ docId: 'doc', workspaceId: 'space' }),
    getRealtimeInputKey({ workspaceId: 'space', docId: 'doc' })
  );
});

test('getRealtimeInputKey follows JSON semantics for subscription input keys', t => {
  t.is(getRealtimeInputKey({ after: undefined }), getRealtimeInputKey({}));
  t.is(getRealtimeInputKey([undefined]), '[null]');
  t.is(
    getRealtimeInputKey(new Date('2026-01-02T03:04:05.000Z')),
    '"2026-01-02T03:04:05.000Z"'
  );
});

test('room helpers produce stable realtime room names', t => {
  t.is(realtimeNotificationRoom('u1'), 'user:u1:notification');
  t.is(realtimeCommentRoom('space', 'doc'), 'workspace:space:doc:doc:comment');
  t.is(
    realtimeWorkspaceEmbeddingProgressRoom('space'),
    'workspace:space:embedding-progress'
  );
  t.is(
    realtimeTranscriptTaskRoom('space', 'task'),
    'copilot:transcript:space:task'
  );
});

test('registerRealtimeLiveQuery registers paired request and topic handlers', async t => {
  const registry = new RealtimeRegistry();

  registerRealtimeLiveQuery(registry, {
    request: {
      name: 'notification.count.get',
      input: z.object({}).strict(),
      handle: async () => ({ count: 7 }),
    },
    topic: {
      name: 'notification.count.changed',
      input: z.object({}).strict(),
      authorize: async () => {},
      room: currentUser => `user:${currentUser?.id}:notification`,
    },
  });

  t.deepEqual(
    await registry.getRequest('notification.count.get').handle(user, {}),
    {
      count: 7,
    }
  );
  t.is(
    registry.getTopic('notification.count.changed').room(user, {}),
    'user:u1:notification'
  );
});

test('realtime providers expose runtime injection metadata for registry dependencies', t => {
  t.true(
    Reflect.getMetadata(
      'design:paramtypes',
      NotificationRealtimeProvider
    ).includes(RealtimeRegistry)
  );
  t.true(
    Reflect.getMetadata('design:paramtypes', CommentRealtimeProvider).includes(
      RealtimeRegistry
    )
  );
  t.true(
    Reflect.getMetadata(
      'design:paramtypes',
      CopilotTranscriptRealtimeProvider
    ).includes(RealtimeRegistry)
  );
});

test('copilot transcript realtime provider registers task live query handlers', async t => {
  const registry = new RealtimeRegistry();
  const assertions: unknown[] = [];
  const ac = {
    user(userId: string) {
      return {
        workspace(workspaceId: string) {
          return {
            allowLocal() {
              return this;
            },
            async assert(action: string) {
              assertions.push({ userId, workspaceId, action });
            },
          };
        },
      };
    },
  } as unknown as AccessController;
  const transcript = {
    async queryTask(
      userId: string,
      workspaceId: string,
      taskId?: string,
      blobId?: string
    ) {
      return { id: taskId ?? blobId, status: 'finished', userId, workspaceId };
    },
  } as unknown as CopilotTranscriptionReader;

  new CopilotTranscriptRealtimeProvider(
    ac,
    transcript,
    registry
  ).onModuleInit();

  t.deepEqual(
    await registry.getRequest('copilot.transcript.task.get').handle(user, {
      workspaceId: 'space',
      taskId: 'task',
    }),
    {
      task: {
        id: 'task',
        status: 'finished',
        userId: 'u1',
        workspaceId: 'space',
      },
    }
  );
  t.deepEqual(assertions, [
    { userId: 'u1', workspaceId: 'space', action: 'Workspace.Copilot' },
  ]);
});

test('publisher emits realtime event with shared input key', t => {
  const registry = new RealtimeRegistry();
  registry.registerTopic({
    name: 'comment.changed',
    input: z.object({ workspaceId: z.string(), docId: z.string() }),
    authorize: async () => {},
    room: (_currentUser, input) =>
      realtimeCommentRoom(input.workspaceId, input.docId),
  });
  const emitted: unknown[] = [];
  const publisher = new RealtimePublisher(registry, {
    broadcast: () => {},
  } as never);
  publisher.attachServer({
    to: (room: string) => ({
      emit: (event: string, payload: unknown) =>
        emitted.push({ room, event, payload }),
    }),
  } as never);

  publisher.publishLocal({
    topic: 'comment.changed',
    input: { docId: 'doc', workspaceId: 'space' },
    event: { changed: true },
  });

  t.like(emitted[0], {
    room: 'workspace:space:doc:doc:comment',
    event: 'realtime:event',
    payload: {
      topic: 'comment.changed',
      inputKey: getRealtimeInputKey({ workspaceId: 'space', docId: 'doc' }),
      event: { changed: true },
    },
  });
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
