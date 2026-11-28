import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';
import ava, { type ExecutionContext } from 'ava';
import Sinon from 'sinon';
import { io, type Socket as SocketIOClient } from 'socket.io-client';
import {
  applyUpdate,
  Array as YArray,
  Doc,
  encodeStateAsUpdate,
  encodeStateVector,
  Map as YMap,
} from 'yjs';

import { CANARY_CLIENT_VERSION_MAX_AGE_DAYS, EventBus } from '../../base';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { DocReader } from '../../core/doc';
import { PermissionService } from '../../core/permission';
import {
  DocRole,
  Models,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from '../../models';
import { addDocToRootDoc } from '../../native';
import { createTestingApp, TestingApp } from '../utils';

type WebsocketError = {
  name: string;
  message: string;
  code?: string;
  data?: Record<string, unknown>;
  requestId?: string;
  status?: number;
  type?: string;
};

type WebsocketResponse<T> = { error: WebsocketError } | { data: T };

const test = ava.serial;

const WS_TIMEOUT_MS = 5_000;

function makeCanaryDateVersion(date: Date, build = '015') {
  return `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${date.getUTCDate()}-canary.${build}`;
}

function unwrapResponse<T>(t: ExecutionContext, res: WebsocketResponse<T>): T {
  if ('data' in res) {
    return res.data;
  }

  t.log(res);
  throw new Error(`Websocket error: ${res.error.name}: ${res.error.message}`);
}

function getErrorResponse<T>(
  t: ExecutionContext,
  res: WebsocketResponse<T>
): WebsocketError {
  if ('error' in res) return res.error;

  t.log(res);
  throw new Error(`Expected websocket error response, got data instead`);
}

function stableError(error: WebsocketError, spaceId: string) {
  return {
    ...error,
    message: error.message.replaceAll(spaceId, '<space>'),
    data: error.data
      ? Object.fromEntries(
          Object.entries(error.data).map(([key, value]) => [
            key,
            value === spaceId ? '<space>' : value,
          ])
        )
      : undefined,
    requestId: error.requestId ? '<request>' : undefined,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout (${timeoutMs}ms): ${label}`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function createClient(
  url: string,
  cookie?: string,
  auth?: Record<string, unknown>
): SocketIOClient {
  return io(url, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    ...(cookie ? { extraHeaders: { cookie } } : {}),
    ...(auth ? { auth } : {}),
  });
}

function waitForConnect(socket: SocketIOClient) {
  if (socket.connected) {
    return Promise.resolve();
  }
  return withTimeout(
    new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    }),
    WS_TIMEOUT_MS,
    'socket connect'
  );
}

function waitForDisconnect(socket: SocketIOClient) {
  if (socket.disconnected) {
    return Promise.resolve();
  }
  return withTimeout(
    new Promise<void>(resolve => {
      socket.once('disconnect', () => resolve());
    }),
    WS_TIMEOUT_MS,
    'socket disconnect'
  );
}

function emitWithAck<T>(socket: SocketIOClient, event: string, data: unknown) {
  return withTimeout(
    new Promise<WebsocketResponse<T>>(resolve => {
      socket.emit(event, data, (res: WebsocketResponse<T>) => resolve(res));
    }),
    WS_TIMEOUT_MS,
    `ack ${event}`
  );
}

function waitForEvent<T>(
  socket: SocketIOClient,
  event: string,
  accept: (payload: T) => boolean = () => true
) {
  return withTimeout(
    new Promise<T>(resolve => {
      const listener = (payload: T) => {
        if (!accept(payload)) return;
        socket.off(event, listener);
        resolve(payload);
      };
      socket.on(event, listener);
    }),
    WS_TIMEOUT_MS,
    `event ${event}`
  );
}

function expectNoEvent(
  socket: SocketIOClient,
  event: string,
  durationMs = 200
) {
  return withTimeout(
    new Promise<void>((resolve, reject) => {
      let timer: NodeJS.Timeout;
      const onEvent = () => {
        clearTimeout(timer);
        socket.off(event, onEvent);
        reject(new Error(`Unexpected event received: ${event}`));
      };

      timer = setTimeout(() => {
        socket.off(event, onEvent);
        resolve();
      }, durationMs);

      socket.on(event, onEvent);
    }),
    WS_TIMEOUT_MS,
    `expect no event ${event}`
  );
}

async function login(app: TestingApp) {
  const { user, cookieHeader } = await loginWithCookie(app);
  const nativeRes = await app
    .POST('/api/auth/sign-in')
    .set('x-affine-client-kind', 'native')
    .send({ email: user.email, password: user.password })
    .expect(200);
  const tokenRes = await app
    .POST('/api/auth/session/exchange')
    .set('x-affine-client-kind', 'native')
    .send({
      code: nativeRes.body.exchangeCode,
      installationId: '00000000-0000-4000-8000-000000000005',
      platform: 'electron',
    })
    .expect(201);

  return { user, cookieHeader, token: tokenRes.body.accessToken as string };
}

async function loginWithCookie(app: TestingApp) {
  const user = await app.createUser();
  const cookieRes = await app
    .POST('/api/auth/sign-in')
    .set('x-affine-version', '0.26.7')
    .send({ email: user.email, password: user.password })
    .expect(200);

  const cookies = cookieRes.get('Set-Cookie') ?? [];
  const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
  return { user, cookieHeader };
}

function createYjsUpdateBase64() {
  const doc = new Doc();
  doc.getMap('m').set('k', 'v');
  const update = encodeStateAsUpdate(doc);
  return Buffer.from(update).toString('base64');
}

async function createSnapshot(
  db: PrismaClient,
  input: {
    workspaceId: string;
    docId: string;
    userId: string;
    blob?: Buffer;
    state?: Buffer;
    updatedAt?: Date;
  }
) {
  await db.snapshot.create({
    data: {
      id: input.docId,
      workspaceId: input.workspaceId,
      blob: input.blob ?? Buffer.from([0, 0]),
      state: input.state ?? Buffer.from([0]),
      createdAt: input.updatedAt ?? new Date(),
      updatedAt: input.updatedAt ?? new Date(),
      createdBy: input.userId,
      updatedBy: input.userId,
    },
  });
}

async function ensureSyncActiveUsersTable(db: PrismaClient) {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS sync_active_users_minutely (
      minute_ts TIMESTAMPTZ(3) NOT NULL PRIMARY KEY,
      active_users INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
    )
  `);
}

async function latestActiveUsers(db: PrismaClient) {
  const rows = await db.$queryRaw<{ activeUsers: number }[]>`
    SELECT active_users::integer AS "activeUsers"
    FROM sync_active_users_minutely
    ORDER BY minute_ts DESC
    LIMIT 1
  `;

  if (!rows[0]) {
    return null;
  }

  return Number(rows[0].activeUsers);
}

async function waitForActiveUsers(db: PrismaClient, expected: number) {
  const deadline = Date.now() + WS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const current = await latestActiveUsers(db);
    if (current === expected) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting active users=${expected}`);
}

let app: TestingApp;
let url: string;

test.before(async () => {
  app = await createTestingApp();
  url = app.url();
});

test.beforeEach(async () => {
  await app.initTestingDB();
  await app.get(BackendRuntimeProvider).activateWorkspaceLifecycleV1();
});

test.after.always(async () => {
  await app.close();
});

test('should reject websocket legacy session token auth', async t => {
  const { cookieHeader } = await login(app);
  const sessionCookie = cookieHeader
    .split('; ')
    .find(cookie => cookie.startsWith('affine_session='));
  const token = sessionCookie?.split('=')[1];
  t.truthy(token);

  const socket = createClient(url, undefined, { token });

  try {
    await t.throwsAsync(() => waitForConnect(socket));
  } finally {
    socket.disconnect();
  }
});

test('should connect websocket with jwt auth', async t => {
  const { token } = await login(app);
  const socket = createClient(url, undefined, { token, tokenType: 'jwt' });

  try {
    await waitForConnect(socket);
    t.true(socket.connected);
  } finally {
    socket.disconnect();
  }
});

test('should reject websocket jwt auth after session deletion', async t => {
  const { token } = await login(app);

  await app
    .POST('/api/auth/sign-out')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const socket = createClient(url, undefined, { token, tokenType: 'jwt' });

  try {
    await t.throwsAsync(() => waitForConnect(socket));
  } finally {
    socket.disconnect();
  }
});

test('push requires an authorized document subscription', async t => {
  const { user, cookieHeader } = await loginWithCookie(app);
  const spaceId = user.id;
  const update = createYjsUpdateBase64();

  const sender = createClient(url, cookieHeader);
  const receiver = createClient(url, cookieHeader);

  try {
    await Promise.all([waitForConnect(sender), waitForConnect(receiver)]);

    const batch = {
      spaces: [{ spaceType: 'userspace', spaceId }],
      protocolVersion: 2,
      clientVersion: '0.27.5',
    };
    for (const socket of [sender, receiver]) {
      unwrapResponse(t, await emitWithAck(socket, 'space:join-batch', batch));
    }

    const noUpdate = expectNoEvent(receiver, 'space:broadcast-doc-updates');
    const error = getErrorResponse(
      t,
      await emitWithAck(sender, 'space:push-doc-update', {
        spaceType: 'userspace',
        spaceId,
        docId: 'doc-2',
        intent: 'update',
        update,
      })
    );
    t.snapshot(stableError(error, spaceId));
    await noUpdate;
  } finally {
    sender.disconnect();
    receiver.disconnect();
  }
});

test('canary date clientVersion should use sync-027 in canary namespace', async t => {
  const prevNamespace = env.NAMESPACE;
  // @ts-expect-error test
  env.NAMESPACE = 'dev';

  try {
    const { user, cookieHeader } = await login(app);
    const spaceId = user.id;
    const update = createYjsUpdateBase64();

    const sender = createClient(url, cookieHeader);
    const receiver = createClient(url, cookieHeader);

    try {
      await Promise.all([waitForConnect(sender), waitForConnect(receiver)]);

      const canaryVersion = makeCanaryDateVersion(new Date(), '015');
      const receiverJoin = unwrapResponse(
        t,
        await emitWithAck<{ clientId: string; success: boolean }>(
          receiver,
          'space:join-batch',
          {
            spaces: [
              { spaceType: 'userspace', spaceId },
              { spaceType: 'userspace', spaceId, docId: 'doc-canary' },
            ],
            protocolVersion: 2,
            clientVersion: canaryVersion,
          }
        )
      );
      t.true(receiverJoin.success);

      const senderJoin = unwrapResponse(
        t,
        await emitWithAck<{ clientId: string; success: boolean }>(
          sender,
          'space:join-batch',
          {
            spaces: [
              { spaceType: 'userspace', spaceId },
              { spaceType: 'userspace', spaceId, docId: 'doc-canary' },
            ],
            protocolVersion: 2,
            clientVersion: canaryVersion,
          }
        )
      );
      t.true(senderJoin.success);

      const onUpdates = waitForEvent<{
        spaceType: string;
        spaceId: string;
        docId: string;
        updates: string[];
      }>(receiver, 'space:broadcast-doc-updates');

      const pushRes = await emitWithAck<{ accepted: true; timestamp?: number }>(
        sender,
        'space:push-doc-update',
        {
          spaceType: 'userspace',
          spaceId,
          docId: 'doc-canary',
          intent: 'update',
          update,
        }
      );
      unwrapResponse(t, pushRes);

      const message = await onUpdates;
      t.is(message.spaceType, 'userspace');
      t.is(message.spaceId, spaceId);
      t.is(message.docId, 'doc-canary');
      t.deepEqual(message.updates, [update]);
    } finally {
      sender.disconnect();
      receiver.disconnect();
    }
  } finally {
    // @ts-expect-error test
    env.NAMESPACE = prevNamespace;
  }
});

test('old canary date clientVersion should be rejected and disconnected in canary namespace', async t => {
  const prevNamespace = env.NAMESPACE;
  // @ts-expect-error test
  env.NAMESPACE = 'dev';

  try {
    const { user, cookieHeader } = await login(app);
    const spaceId = user.id;

    const socket = createClient(url, cookieHeader);
    try {
      await waitForConnect(socket);

      const old = new Date(
        Date.now() -
          (CANARY_CLIENT_VERSION_MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000
      );

      const res = unwrapResponse(
        t,
        await emitWithAck<{ clientId: string; success: boolean }>(
          socket,
          'space:join-batch',
          {
            spaces: [{ spaceType: 'userspace', spaceId }],
            protocolVersion: 2,
            clientVersion: makeCanaryDateVersion(old, '015'),
          }
        )
      );
      t.false(res.success);

      await waitForDisconnect(socket);
    } finally {
      socket.disconnect();
    }
  } finally {
    // @ts-expect-error test
    env.NAMESPACE = prevNamespace;
  }
});

test('canary date clientVersion should be rejected outside canary namespace', async t => {
  const prevNamespace = env.NAMESPACE;
  // @ts-expect-error test
  env.NAMESPACE = 'production';

  try {
    const { user, cookieHeader } = await login(app);
    const spaceId = user.id;

    const socket = createClient(url, cookieHeader);
    try {
      await waitForConnect(socket);

      const res = unwrapResponse(
        t,
        await emitWithAck<{ clientId: string; success: boolean }>(
          socket,
          'space:join-batch',
          {
            spaces: [{ spaceType: 'userspace', spaceId }],
            protocolVersion: 2,
            clientVersion: makeCanaryDateVersion(new Date(), '15'),
          }
        )
      );
      t.false(res.success);

      await waitForDisconnect(socket);
    } finally {
      socket.disconnect();
    }
  } finally {
    // @ts-expect-error test
    env.NAMESPACE = prevNamespace;
  }
});

test('space:join-batch should validate entries before joining', async t => {
  const { user, cookieHeader } = await login(app);
  const socket = createClient(url, cookieHeader);
  const spaceId = user.id;

  try {
    await waitForConnect(socket);

    const invalidBatches = [
      {
        label: 'empty',
        payload: { spaces: [], clientVersion: '0.27.5' },
      },
      {
        label: 'missing client version',
        payload: { spaces: [{ spaceType: 'userspace', spaceId }] },
      },
      {
        label: 'cross workspace',
        payload: {
          spaces: [
            { spaceType: 'userspace', spaceId },
            { spaceType: 'userspace', spaceId: `${spaceId}-other` },
          ],
          protocolVersion: 2,
          clientVersion: '0.27.5',
        },
      },
      {
        label: 'duplicate',
        payload: {
          spaces: [
            { spaceType: 'userspace', spaceId, docId: 'doc-1' },
            { spaceType: 'userspace', spaceId, docId: 'doc-1' },
          ],
          protocolVersion: 2,
          clientVersion: '0.27.5',
        },
      },
      {
        label: 'invalid entry',
        payload: {
          spaces: [{ spaceType: 'invalid', spaceId }],
          protocolVersion: 2,
          clientVersion: '0.27.5',
        },
      },
      {
        label: 'over limit',
        payload: {
          spaces: Array.from({ length: 101 }, (_, index) => ({
            spaceType: 'userspace',
            spaceId,
            docId: `doc-${index}`,
          })),
          protocolVersion: 2,
          clientVersion: '0.27.5',
        },
      },
    ];

    for (const { label, payload } of invalidBatches) {
      const error = getErrorResponse(
        t,
        await emitWithAck(socket, 'space:join-batch', payload)
      );
      t.is(error.name, 'BAD_REQUEST', label);
    }
  } finally {
    socket.disconnect();
  }
});

test('space:join-batch rejects old clients and accepts the current web build', async t => {
  const { user, cookieHeader } = await login(app);
  const webPackage = JSON.parse(
    readFileSync(
      resolve(process.cwd(), '../../frontend/apps/web/package.json'),
      'utf8'
    )
  );

  for (const [clientVersion, accepted] of [
    ['0.27.4', false],
    [webPackage.version, true],
  ] as const) {
    const socket = createClient(url, cookieHeader);
    try {
      await waitForConnect(socket);
      const result = unwrapResponse(
        t,
        await emitWithAck<{ clientId: string; success: boolean }>(
          socket,
          'space:join-batch',
          {
            spaces: [{ spaceType: 'userspace', spaceId: user.id }],
            protocolVersion: 2,
            clientVersion,
          }
        )
      );
      t.is(result.success, accepted, clientVersion);
      if (!accepted) await waitForDisconnect(socket);
    } finally {
      socket.disconnect();
    }
  }
});

test('legacy space:join gets an unsupported client version error and is disconnected', async t => {
  const { user, cookieHeader } = await login(app);
  const socket = createClient(url, cookieHeader);
  try {
    await waitForConnect(socket);
    const error = getErrorResponse(
      t,
      await emitWithAck(socket, 'space:join', {
        spaceType: 'userspace',
        spaceId: user.id,
        clientVersion: '0.27.4',
      })
    );
    t.is(error.name, 'UNSUPPORTED_CLIENT_VERSION');
    t.true(error.message.includes('0.27.4'));
    await waitForDisconnect(socket);
  } finally {
    socket.disconnect();
  }
});

test('space:join-batch joins rooms and initializes workspace documents', async t => {
  const models = app.get(Models);
  const { user: owner, cookieHeader: ownerCookieHeader } = await login(app);
  const { cookieHeader: deniedCookieHeader } = await login(app);
  const workspace = await models.workspace.create(owner.id);

  const ownerSocket = createClient(url, ownerCookieHeader);
  const receiverSocket = createClient(url, ownerCookieHeader);
  const deniedSocket = createClient(url, deniedCookieHeader);

  try {
    await Promise.all([
      waitForConnect(ownerSocket),
      waitForConnect(receiverSocket),
      waitForConnect(deniedSocket),
    ]);

    const batch = {
      spaces: [
        { spaceType: 'workspace', spaceId: workspace.id },
        { spaceType: 'workspace', spaceId: workspace.id, docId: 'doc-a' },
        { spaceType: 'workspace', spaceId: workspace.id, docId: 'doc-b' },
        {
          spaceType: 'workspace',
          spaceId: workspace.id,
          docId: `db$${workspace.id}$docProperties`,
        },
      ],
      protocolVersion: 2,
      clientVersion: '0.27.5',
    };

    const db = app.get(PrismaClient);
    const runtime = app.get(BackendRuntimeProvider);
    await db.$executeRaw`DELETE FROM storage_reconciliation_checkpoints WHERE kind='workspace_doc_lifecycle_activation' AND scope='global'`;
    const inactive = getErrorResponse(
      t,
      await emitWithAck(ownerSocket, 'space:join-batch', batch)
    );
    t.is(inactive.name, 'WORKSPACE_SYNC_UNAVAILABLE');
    t.is(inactive.status, 503);
    const [checkpoint] = await db.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) AS count FROM storage_reconciliation_checkpoints WHERE kind IN ('workspace_doc_lifecycle_activation','workspace_doc_lifecycle') AND (scope='global' OR scope=${workspace.id})`;
    t.is(Number(checkpoint.count), 0);
    t.is(await db.update.count({ where: { workspaceId: workspace.id } }), 0);
    t.is(
      await db.workspaceDoc.count({ where: { workspaceId: workspace.id } }),
      0
    );
    const legacy = unwrapResponse(
      t,
      await emitWithAck<{ success: boolean }>(ownerSocket, 'space:join-batch', {
        ...batch,
        protocolVersion: 1,
      })
    );
    t.true(legacy.success);
    t.true(await runtime.activateWorkspaceLifecycleV1());
    t.false(await runtime.activateWorkspaceLifecycleV1());

    for (const socket of [ownerSocket, receiverSocket]) {
      const result = unwrapResponse(
        t,
        await emitWithAck<{ clientId: string; success: boolean }>(
          socket,
          'space:join-batch',
          batch
        )
      );
      t.true(result.success);
    }

    const awarenessOnlyResult = unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        ownerSocket,
        'space:join-batch',
        {
          spaces: [
            {
              spaceType: 'workspace',
              spaceId: workspace.id,
              docId: 'doc-c',
            },
          ],
          protocolVersion: 2,
          clientVersion: '0.27.5',
        }
      )
    );
    t.true(awarenessOnlyResult.success);

    const timestamps = unwrapResponse(
      t,
      await emitWithAck<Record<string, number>>(
        ownerSocket,
        'space:load-doc-timestamps',
        {
          spaceType: 'workspace',
          spaceId: workspace.id,
        }
      )
    );
    t.deepEqual(timestamps, {});

    const deniedError = getErrorResponse(
      t,
      await emitWithAck(deniedSocket, 'space:join-batch', batch)
    );
    t.is(deniedError.name, 'SPACE_ACCESS_DENIED');

    const deniedSyncRoomError = getErrorResponse(
      t,
      await emitWithAck(deniedSocket, 'space:load-doc-timestamps', {
        spaceType: 'workspace',
        spaceId: workspace.id,
      })
    );
    t.is(deniedSyncRoomError.name, 'NOT_IN_SPACE');

    const deniedAwarenessRoomError = getErrorResponse(
      t,
      await emitWithAck(deniedSocket, 'space:load-awarenesses', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId: 'doc-a',
      })
    );
    t.is(deniedAwarenessRoomError.name, 'NOT_IN_SPACE');

    const receivedA = waitForEvent<{
      spaceType: string;
      spaceId: string;
      docId: string;
      awarenessUpdate: string;
    }>(receiverSocket, 'space:broadcast-awareness-update');
    const noDeniedEvent = expectNoEvent(
      deniedSocket,
      'space:broadcast-awareness-update'
    );

    ownerSocket.emit('space:update-awareness', {
      spaceType: 'workspace',
      spaceId: workspace.id,
      docId: 'doc-a',
      awarenessUpdate: 'AQID',
    });
    const messageA = await receivedA;

    const receivedB = waitForEvent<{
      spaceType: string;
      spaceId: string;
      docId: string;
      awarenessUpdate: string;
    }>(receiverSocket, 'space:broadcast-awareness-update');
    ownerSocket.emit('space:update-awareness', {
      spaceType: 'workspace',
      spaceId: workspace.id,
      docId: 'doc-b',
      awarenessUpdate: 'BAUG',
    });
    const messageB = await receivedB;

    t.deepEqual(
      new Set([messageA.docId, messageB.docId]),
      new Set(['doc-a', 'doc-b'])
    );
    await noDeniedEvent;
    unwrapResponse(
      t,
      await emitWithAck(ownerSocket, 'space:join-batch', {
        spaces: [
          {
            spaceType: 'workspace',
            spaceId: workspace.id,
            docId: workspace.id,
          },
        ],
        protocolVersion: 2,
        clientVersion: '0.27.5',
      })
    );
    const root = addDocToRootDoc(Buffer.from([0, 0]), 'doc-a');
    unwrapResponse(
      t,
      await emitWithAck(ownerSocket, 'space:push-doc-update', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId: workspace.id,
        intent: 'update',
        update: Buffer.from(root).toString('base64'),
      })
    );
    for (const docId of [
      'doc-a',
      'doc-a',
      `db$${workspace.id}$docProperties`,
    ]) {
      await app.get(PrismaClient).$executeRaw`
        UPDATE workspace_sync_permission_generations
        SET generation = generation + 1
        WHERE workspace_id = ${workspace.id}
      `;
      unwrapResponse(
        t,
        await emitWithAck(ownerSocket, 'space:join-batch', batch)
      );
      unwrapResponse(
        t,
        await emitWithAck(ownerSocket, 'space:push-doc-update', {
          spaceType: 'workspace',
          spaceId: workspace.id,
          docId,
          intent: docId === 'doc-a' ? 'create' : 'update',
          update: createYjsUpdateBase64(),
        })
      );
    }
    t.true(await models.doc.exists(workspace.id, 'doc-a'));
  } finally {
    ownerSocket.disconnect();
    receiverSocket.disconnect();
    deniedSocket.disconnect();
  }
});

test('batch doc entries require Doc.Read atomically', async t => {
  const db = app.get(PrismaClient);
  const models = app.get(Models);
  const { user: owner } = await login(app);
  const { user: collaborator, cookieHeader } = await login(app);
  const workspace = await models.workspace.create(owner.id);
  const docId = 'batch-private-doc';

  await models.workspaceUser.set(
    workspace.id,
    collaborator.id,
    WorkspaceRole.Collaborator,
    { status: WorkspaceMemberStatus.Accepted }
  );
  await models.doc.setDefaultRole(workspace.id, docId, DocRole.None);
  await createSnapshot(db, {
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const socket = createClient(url, cookieHeader);
  try {
    await waitForConnect(socket);

    const error = getErrorResponse(
      t,
      await emitWithAck(socket, 'space:join-batch', {
        spaces: [
          { spaceType: 'workspace', spaceId: workspace.id },
          {
            spaceType: 'workspace',
            spaceId: workspace.id,
            docId: `space:${docId}`,
          },
        ],
        protocolVersion: 2,
        clientVersion: '0.27.5',
      })
    );
    t.true(error.message.includes('Doc.Read'));

    const timestampsError = getErrorResponse(
      t,
      await emitWithAck(socket, 'space:load-doc-timestamps', {
        spaceType: 'workspace',
        spaceId: workspace.id,
      })
    );
    t.is(timestampsError.name, 'NOT_IN_SPACE');
  } finally {
    socket.disconnect();
  }
});

test('batch sync routes active updates and only broadcasts invalidation to control room', async t => {
  const { user, cookieHeader } = await login(app);
  const spaceId = user.id;
  const sender = createClient(url, cookieHeader);
  const receiver = createClient(url, cookieHeader);
  const passive = createClient(url, cookieHeader);

  try {
    await Promise.all([
      waitForConnect(sender),
      waitForConnect(receiver),
      waitForConnect(passive),
    ]);

    const activeBatch = {
      spaces: [
        { spaceType: 'userspace', spaceId },
        { spaceType: 'userspace', spaceId, docId: 'some-doc' },
      ],
      protocolVersion: 2,
      clientVersion: '0.27.5',
    };
    for (const socket of [sender, receiver]) {
      const result = unwrapResponse(
        t,
        await emitWithAck<{ clientId: string; success: boolean }>(
          socket,
          'space:join-batch',
          activeBatch
        )
      );
      t.true(result.success);
    }
    const passiveJoin = unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        passive,
        'space:join-batch',
        {
          spaces: [{ spaceType: 'userspace', spaceId }],
          protocolVersion: 2,
          clientVersion: '0.27.5',
        }
      )
    );
    t.true(passiveJoin.success);

    const receivedUpdate = waitForEvent<{
      docId: string;
      updates: string[];
    }>(receiver, 'space:broadcast-doc-updates');
    const receivedInvalidation = waitForEvent<{
      spaceType: string;
      spaceId: string;
      timestamp: number;
      docId?: string;
      updates?: string[];
    }>(receiver, 'space:broadcast-doc-invalidation');
    const noPassiveUpdate = expectNoEvent(
      passive,
      'space:broadcast-doc-updates'
    );

    unwrapResponse(
      t,
      await emitWithAck(sender, 'space:push-doc-update', {
        spaceType: 'userspace',
        spaceId,
        docId: 'some-doc',
        intent: 'update',
        update: createYjsUpdateBase64(),
      })
    );

    const [update, invalidation] = await Promise.all([
      receivedUpdate,
      receivedInvalidation,
    ]);
    t.is(update.docId, 'some-doc');
    t.deepEqual(Object.keys(invalidation).sort(), [
      'spaceId',
      'spaceType',
      'timestamp',
    ]);
    await noPassiveUpdate;

    const leave = unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        receiver,
        'space:leave-batch',
        {
          spaceType: 'userspace',
          spaceId,
          docIds: ['some-doc'],
        }
      )
    );
    t.true(leave.success);

    const noLeftUpdate = expectNoEvent(receiver, 'space:broadcast-doc-updates');
    const receivedAfterLeave = waitForEvent(
      receiver,
      'space:broadcast-doc-invalidation'
    );
    unwrapResponse(
      t,
      await emitWithAck(sender, 'space:push-doc-update', {
        spaceType: 'userspace',
        spaceId,
        docId: 'some-doc',
        intent: 'update',
        update: createYjsUpdateBase64(),
      })
    );
    await Promise.all([noLeftUpdate, receivedAfterLeave]);
  } finally {
    sender.disconnect();
    receiver.disconnect();
    passive.disconnect();
  }
});

test('partial roots accept edits and ordinary creation uses persisted identity', async t => {
  const { user, cookieHeader } = await login(app);
  const workspace = await app.get(Models).workspace.create(user.id);
  const db = app.get(PrismaClient);
  const root = new Doc();
  const pages = new YArray<{ id: string }>();
  root.getMap('meta').set('pages', pages);
  const vector = encodeStateVector(root);
  pages.push([{ id: 'missing-prefix-doc' }]);
  await createSnapshot(db, {
    workspaceId: workspace.id,
    docId: workspace.id,
    userId: user.id,
    blob: Buffer.from(encodeStateAsUpdate(root, vector)),
  });
  const legacyCases: {
    workspaceId: string;
    docId: string;
    duplicateId: string;
  }[] = [];
  for (let shape = 0; shape < 4; shape++) {
    const legacyWorkspace = await app.get(Models).workspace.create(user.id);
    const legacyRoot = new Doc();
    const docId = `legacy-shape-${shape}`;
    const duplicateId = `duplicate-${shape}`;
    const entry = (id: string, shared: boolean) =>
      shared
        ? new YMap<unknown>([
            ['id', id],
            ['trash', true],
          ])
        : { id, trash: true };
    if (shape === 0)
      legacyRoot
        .getMap('meta')
        .set('pages', [
          entry(docId, false),
          entry(duplicateId, false),
          entry(duplicateId, false),
        ]);
    else {
      const legacyPages = new YArray();
      legacyRoot.getMap('meta').set('pages', legacyPages);
      legacyPages.push([
        entry(docId, shape >= 2),
        entry(duplicateId, shape >= 2),
        entry(duplicateId, shape === 2),
      ]);
    }
    await createSnapshot(db, {
      workspaceId: legacyWorkspace.id,
      docId: legacyWorkspace.id,
      userId: user.id,
      blob: Buffer.from(encodeStateAsUpdate(legacyRoot)),
    });
    legacyCases.push({ workspaceId: legacyWorkspace.id, docId, duplicateId });
    legacyRoot.destroy();
  }
  const runtime = app.get(BackendRuntimeProvider);
  const models = app.get(Models);
  const { user: collaborator, cookieHeader: collaboratorCookie } =
    await login(app);
  await models.workspaceUser.set(
    workspace.id,
    collaborator.id,
    WorkspaceRole.Collaborator,
    {
      status: WorkspaceMemberStatus.Accepted,
    }
  );
  const existingReaderDoc = 'legacy-existing-reader-doc';
  await createSnapshot(db, {
    workspaceId: workspace.id,
    docId: existingReaderDoc,
    userId: user.id,
  });
  await models.doc.setDefaultRole(
    workspace.id,
    existingReaderDoc,
    DocRole.None
  );
  await models.docUser.set(
    workspace.id,
    existingReaderDoc,
    collaborator.id,
    DocRole.Reader
  );
  await db.$executeRaw`DELETE FROM storage_reconciliation_checkpoints WHERE kind='workspace_doc_lifecycle_activation' AND scope='global'`;
  await runtime.ensureWorkspaceLifecycleV1(workspace.id);
  const [checkpoint] = await db.$queryRaw<
    { count: bigint }[]
  >`SELECT count(*) AS count FROM storage_reconciliation_checkpoints WHERE kind='workspace_doc_lifecycle' AND scope=${workspace.id}`;
  t.is(Number(checkpoint.count), 0);
  const legacySocket = createClient(url, collaboratorCookie);
  const legacyDocId = 'legacy-new-default-manager-doc';
  const legacyBatch = {
    spaces: [
      { spaceType: 'workspace', spaceId: workspace.id },
      { spaceType: 'workspace', spaceId: workspace.id, docId: legacyDocId },
      {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId: existingReaderDoc,
      },
    ],
    protocolVersion: 1,
    clientVersion: '0.27.5',
  };
  const socket = createClient(url, cookieHeader);
  try {
    await waitForConnect(socket);
    await waitForConnect(legacySocket);
    unwrapResponse(
      t,
      await emitWithAck(legacySocket, 'space:join-batch', legacyBatch)
    );
    const missing = getErrorResponse(
      t,
      await emitWithAck(legacySocket, 'space:load-doc', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId: legacyDocId,
      })
    );
    t.is(missing.name, 'DOC_NOT_FOUND');
    const legacyPush = {
      spaceType: 'workspace',
      spaceId: workspace.id,
      docId: legacyDocId,
      intent: 'create',
      update: Buffer.from([0, 0]).toString('base64'),
    };
    const legacyCreated = unwrapResponse(
      t,
      await emitWithAck<{ created: boolean }>(
        legacySocket,
        'space:push-doc-update',
        legacyPush
      )
    );
    t.true(legacyCreated.created);
    const beforeDenied = await db.update.count({
      where: { workspaceId: workspace.id, id: existingReaderDoc },
    });
    const deniedCreate = getErrorResponse(
      t,
      await emitWithAck(legacySocket, 'space:push-doc-update', {
        ...legacyPush,
        docId: existingReaderDoc,
      })
    );
    t.is(deniedCreate.name, 'ACCESS_DENIED');
    t.is(
      await db.update.count({
        where: { workspaceId: workspace.id, id: existingReaderDoc },
      }),
      beforeDenied
    );
    for (const lifecycle of ['trash', 'restore']) {
      const denied = getErrorResponse(
        t,
        await emitWithAck(legacySocket, 'space:doc-lifecycle', {
          spaceType: 'workspace',
          spaceId: workspace.id,
          docId: legacyDocId,
          lifecycle,
        })
      );
      t.is(denied.name, 'WORKSPACE_SYNC_UNAVAILABLE');
    }
    t.is(
      await db.workspaceDoc.count({
        where: { workspaceId: workspace.id, docId: legacyDocId },
      }),
      0
    );
    t.true(await runtime.activateWorkspaceLifecycleV1());
    const crossed = getErrorResponse(
      t,
      await emitWithAck(legacySocket, 'space:push-doc-update', legacyPush)
    );
    t.is(crossed.name, 'BAD_REQUEST');
    const rejoin = getErrorResponse(
      t,
      await emitWithAck(legacySocket, 'space:join-batch', legacyBatch)
    );
    t.is(rejoin.name, 'WORKSPACE_SYNC_UNAVAILABLE');
    legacySocket.disconnect();
    const joined = unwrapResponse(
      t,
      await emitWithAck<{ protocolVersion: number }>(
        socket,
        'space:join-batch',
        {
          spaces: [
            { spaceType: 'workspace', spaceId: workspace.id },
            {
              spaceType: 'workspace',
              spaceId: workspace.id,
              docId: workspace.id,
            },
          ],
          clientVersion: '0.27.5',
          protocolVersion: 2,
        }
      )
    );
    t.is(joined.protocolVersion, 2);
    const independent = new Doc();
    independent.getMap('meta').set('name', 'saved while partial');
    unwrapResponse(
      t,
      await emitWithAck(socket, 'space:push-doc-update', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId: workspace.id,
        intent: 'update',
        update: Buffer.from(encodeStateAsUpdate(independent)).toString(
          'base64'
        ),
      })
    );
    const loaded = unwrapResponse(
      t,
      await emitWithAck<{ missing: string }>(socket, 'space:load-doc', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId: workspace.id,
      })
    );
    const projected = new Doc();
    applyUpdate(projected, Buffer.from(loaded.missing, 'base64'));
    t.is(projected.getMap('meta').get('name'), 'saved while partial');

    const docId = 'new-without-root-entry';
    const push = {
      spaceType: 'workspace',
      spaceId: workspace.id,
      docId,
      intent: 'create',
      update: Buffer.from([0, 0]).toString('base64'),
    };
    const created = unwrapResponse(
      t,
      await emitWithAck<{ created: boolean }>(
        socket,
        'space:push-doc-update',
        push
      )
    );
    t.true(created.created);
    const retried = unwrapResponse(
      t,
      await emitWithAck<{ created: boolean }>(
        socket,
        'space:push-doc-update',
        push
      )
    );
    t.false(retried.created);
    const state = unwrapResponse(
      t,
      await emitWithAck<{
        docs: { docId: string }[];
        clocks: Record<string, number>;
      }>(socket, 'space:load-workspace-state', {
        spaceType: 'workspace',
        spaceId: workspace.id,
      })
    );
    t.true(state.docs.some(doc => doc.docId === docId));
    t.true(workspace.id in state.clocks);
    const deleted = unwrapResponse(
      t,
      await emitWithAck<{ timestamp: number; rootUpdate?: string }>(
        socket,
        'space:doc-lifecycle',
        {
          spaceType: 'workspace',
          spaceId: workspace.id,
          docId,
          lifecycle: 'delete',
        }
      )
    );
    t.true(deleted.timestamp > 0);
    t.is(deleted.rootUpdate, undefined);
    const rejected = getErrorResponse(
      t,
      await emitWithAck(socket, 'space:push-doc-update', push)
    );
    t.is(rejected.name, 'NOT_FOUND');
    for (const legacy of legacyCases) {
      await app
        .get(BackendRuntimeProvider)
        .ensureWorkspaceLifecycleV1(legacy.workspaceId);
      const state = await app
        .get(BackendRuntimeProvider)
        .getWorkspaceStateV1(legacy.workspaceId, user.id);
      t.true(
        state.docs.some(
          doc => doc.docId === legacy.docId && doc.lifecycle === 'trashed'
        )
      );
      t.false(state.docs.some(doc => doc.docId === legacy.duplicateId));
      t.is(
        await db.docGrant.count({
          where: { workspaceId: legacy.workspaceId, docId: legacy.docId },
        }),
        0
      );
    }
  } finally {
    legacySocket.disconnect();
    socket.disconnect();
    root.destroy();
  }
});

test('permission revocation removes an active document subscription', async t => {
  const db = app.get(PrismaClient);
  const models = app.get(Models);
  const { user: owner, cookieHeader: ownerCookie } = await login(app);
  const { user: collaborator, cookieHeader: collaboratorCookie } =
    await login(app);
  const workspace = await models.workspace.create(owner.id);
  const docId = 'revoked-doc';

  await models.workspaceUser.set(
    workspace.id,
    collaborator.id,
    WorkspaceRole.Collaborator,
    { status: WorkspaceMemberStatus.Accepted }
  );
  await models.doc.setDefaultRole(workspace.id, docId, DocRole.None);
  await models.docUser.set(
    workspace.id,
    docId,
    collaborator.id,
    DocRole.Editor
  );
  await createSnapshot(db, {
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
    blob: Buffer.from(encodeStateAsUpdate(new Doc())),
    state: Buffer.from(encodeStateVector(new Doc())),
  });

  const ownerSocket = createClient(url, ownerCookie);
  const otherOwnerSocket = createClient(url, ownerCookie);
  const collaboratorSocket = createClient(url, collaboratorCookie);
  try {
    await Promise.all([
      waitForConnect(ownerSocket),
      waitForConnect(otherOwnerSocket),
      waitForConnect(collaboratorSocket),
    ]);

    const join = {
      spaces: [
        { spaceType: 'workspace', spaceId: workspace.id },
        { spaceType: 'workspace', spaceId: workspace.id, docId },
      ],
      protocolVersion: 2,
      clientVersion: '0.27.5',
    };
    const ownerJoin = unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        ownerSocket,
        'space:join-batch',
        join
      )
    );
    t.true(ownerJoin.success);
    unwrapResponse(
      t,
      await emitWithAck(otherOwnerSocket, 'space:join-batch', join)
    );

    const runtime = app.get(BackendRuntimeProvider);
    const loadGeneration = runtime.getSyncPermissionGenerationV1.bind(runtime);
    let generationReads = 0;
    const generationStub = Sinon.stub(
      runtime,
      'getSyncPermissionGenerationV1'
    ).callsFake(async workspaceId => {
      generationReads += 1;
      const generation = await loadGeneration(workspaceId);
      if (generationReads === 2) {
        await db.docGrant.deleteMany({
          where: {
            workspaceId: workspace.id,
            docId,
            principalType: 'user',
            principalId: collaborator.id,
          },
        });
      }
      return generation;
    });
    let racedJoinResponse: WebsocketResponse<unknown>;
    try {
      racedJoinResponse = await emitWithAck(
        collaboratorSocket,
        'space:join-batch',
        join
      );
    } finally {
      generationStub.restore();
    }
    const racedJoin = getErrorResponse(t, racedJoinResponse);
    t.snapshot(stableError(racedJoin, workspace.id));

    await models.docUser.set(
      workspace.id,
      docId,
      collaborator.id,
      DocRole.Editor
    );
    const collaboratorJoin = unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        collaboratorSocket,
        'space:join-batch',
        join
      )
    );
    t.true(collaboratorJoin.success);

    const updatedWorkspace = await models.workspace.get(workspace.id);
    if (!updatedWorkspace) {
      throw new Error('Workspace disappeared during permission test');
    }
    await app.get(EventBus).emitAsync('workspace.updated', updatedWorkspace);
    const policyChangeLoad = unwrapResponse(
      t,
      await emitWithAck(collaboratorSocket, 'space:load-doc', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId,
      })
    );
    t.truthy(policyChangeLoad);
    unwrapResponse(
      t,
      await emitWithAck(collaboratorSocket, 'space:join-batch', join)
    );

    const permissionService = app.get(PermissionService);
    const batchPermissions =
      permissionService.batchDocPermissions.bind(permissionService);
    const inventoryPermissions = Sinon.spy(
      permissionService,
      'batchDocPermissions'
    );
    try {
      for (let i = 0; i < 100; i++) {
        await app.get(EventBus).emitAsync('backendRuntime.invalidation', {
          version: 1,
          kind: 'workspaceInventoryChanged',
          workspaceId: workspace.id,
          docId: `new-document-${i}`,
        });
      }
      t.is(inventoryPermissions.callCount, 0);
    } finally {
      inventoryPermissions.restore();
    }
    const unrelatedDocId = 'unrelated-doc';
    await createSnapshot(db, {
      workspaceId: workspace.id,
      docId: unrelatedDocId,
      userId: owner.id,
      blob: Buffer.from(encodeStateAsUpdate(new Doc())),
      state: Buffer.from(encodeStateVector(new Doc())),
    });
    unwrapResponse(
      t,
      await emitWithAck(otherOwnerSocket, 'space:join-batch', {
        ...join,
        spaces: [
          {
            spaceType: 'workspace',
            spaceId: workspace.id,
            docId: unrelatedDocId,
          },
        ],
      })
    );
    const changed = { workspaceId: workspace.id, docId };
    for (const burstSize of [1, 20]) {
      await models.docUser.set(
        workspace.id,
        docId,
        collaborator.id,
        DocRole.Editor
      );
      unwrapResponse(
        t,
        await emitWithAck(collaboratorSocket, 'space:join-batch', join)
      );
      const captured = [
        Promise.withResolvers<void>(),
        Promise.withResolvers<void>(),
      ];
      const resume = [
        Promise.withResolvers<void>(),
        Promise.withResolvers<void>(),
      ];
      let reads = 0;
      let ownerReads = 0;
      const permissionStub = Sinon.stub(
        permissionService,
        'batchDocPermissions'
      ).callsFake(async input => {
        const result = await batchPermissions(input);
        if (input.userId === owner.id) {
          ownerReads += 1;
          t.deepEqual(
            input.docs.map(doc => doc.docId),
            [docId]
          );
        }
        if (input.userId === collaborator.id) {
          const index = reads++;
          captured[index].resolve();
          await resume[index].promise;
        }
        return result;
      });
      const oldRevalidation = app
        .get(EventBus)
        .emitAsync('backendRuntime.invalidation', {
          version: 1,
          kind: 'workspaceInventoryChanged',
          ...changed,
        });
      await captured[0].promise;
      const unrelatedUpdate = waitForEvent<{ docId: string }>(
        otherOwnerSocket,
        'space:broadcast-doc-updates',
        message => message.docId === unrelatedDocId
      );
      await app.get(EventBus).emitAsync('doc.updates.pushed', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId: unrelatedDocId,
        updates: [Buffer.from(createYjsUpdateBase64(), 'base64')],
        timestamp: Date.now(),
      });
      t.is((await unrelatedUpdate).docId, unrelatedDocId);
      await db.docGrant.deleteMany({
        where: {
          workspaceId: workspace.id,
          docId,
          principalType: 'user',
          principalId: collaborator.id,
        },
      });
      const newRevalidation = Promise.all(
        Array.from({ length: burstSize }, () =>
          app.get(EventBus).emitAsync('backendRuntime.invalidation', {
            version: 1,
            kind: 'workspaceInventoryChanged',
            ...changed,
          })
        )
      );
      const noEarlyUpdate = expectNoEvent(
        ownerSocket,
        'space:broadcast-doc-updates'
      );
      const invalidation = waitForEvent<{ inventoryChanged?: boolean }>(
        ownerSocket,
        'space:broadcast-doc-invalidation',
        message => !message.inventoryChanged
      );
      const update = Buffer.from(createYjsUpdateBase64(), 'base64');
      await db.snapshot.update({
        where: { workspaceId_id: { workspaceId: workspace.id, id: docId } },
        data: { blob: update, updatedAt: new Date() },
      });
      await app.get(EventBus).emitAsync('doc.updates.pushed', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId,
        updates: [update],
        timestamp: Date.now(),
      });
      try {
        await noEarlyUpdate;
        t.is(reads, 1);
        resume[0].resolve();
        await captured[1].promise;
        t.not((await invalidation).inventoryChanged, true);
        unwrapResponse(
          t,
          await emitWithAck(ownerSocket, 'space:join-batch', join)
        );
        const repaired = unwrapResponse(
          t,
          await emitWithAck<{ missing: string }>(
            ownerSocket,
            'space:load-doc',
            {
              spaceType: 'workspace',
              spaceId: workspace.id,
              docId,
            }
          )
        );
        const repairedDoc = new Doc();
        applyUpdate(repairedDoc, Buffer.from(repaired.missing, 'base64'));
        t.is(repairedDoc.getMap('m').get('k'), 'v');
        repairedDoc.destroy();
        const noRevokedUpdate = expectNoEvent(
          collaboratorSocket,
          'space:broadcast-doc-updates'
        );
        resume[1].resolve();
        await Promise.all([oldRevalidation, newRevalidation, noRevokedUpdate]);
        t.is(reads, 2);
        t.is(ownerReads, 3);
      } finally {
        for (const pending of resume) pending.resolve();
        await Promise.all([oldRevalidation, newRevalidation]);
        permissionStub.restore();
      }
      const revokedLoad = getErrorResponse(
        t,
        await emitWithAck(collaboratorSocket, 'space:load-doc', {
          spaceType: 'workspace',
          spaceId: workspace.id,
          docId,
        })
      );
      t.is(revokedLoad.name, 'NOT_IN_SPACE');
    }
    const staleGenerationLoad = getErrorResponse(
      t,
      await emitWithAck(collaboratorSocket, 'space:load-doc', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId,
      })
    );
    t.snapshot(stableError(staleGenerationLoad, workspace.id));
    await app.get(EventBus).emitAsync('backendRuntime.invalidation', {
      version: 1,
      kind: 'workspaceInventoryChanged',
      workspaceId: workspace.id,
      docId,
    });

    const revokedPush = getErrorResponse(
      t,
      await emitWithAck(collaboratorSocket, 'space:push-doc-update', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId,
        intent: 'update',
        update: createYjsUpdateBase64(),
      })
    );
    t.snapshot(stableError(revokedPush, workspace.id));
    t.is(
      await db.update.count({
        where: { workspaceId: workspace.id, id: docId },
      }),
      0
    );

    unwrapResponse(
      t,
      await emitWithAck(ownerSocket, 'space:join-batch', {
        spaces: [
          { spaceType: 'workspace', spaceId: workspace.id },
          { spaceType: 'workspace', spaceId: workspace.id, docId },
        ],
        protocolVersion: 2,
        clientVersion: '0.27.5',
      })
    );

    const noRevokedUpdate = expectNoEvent(
      collaboratorSocket,
      'space:broadcast-doc-updates'
    );
    unwrapResponse(
      t,
      await emitWithAck(ownerSocket, 'space:push-doc-update', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId,
        intent: 'update',
        update: createYjsUpdateBase64(),
      })
    );
    await noRevokedUpdate;

    const otherDocId = 'generation-race-unrelated-doc';
    await createSnapshot(db, {
      workspaceId: workspace.id,
      docId: otherDocId,
      userId: owner.id,
    });
    const otherDocJoin = {
      ...join,
      spaces: [
        ...join.spaces,
        { spaceType: 'workspace', spaceId: workspace.id, docId: otherDocId },
      ],
    };
    for (const socket of [ownerSocket, otherOwnerSocket]) {
      unwrapResponse(
        t,
        await emitWithAck(socket, 'space:join-batch', otherDocJoin)
      );
    }
    const captured = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const checkedDocs: string[][] = [];
    const permissionStub = Sinon.stub(
      permissionService,
      'batchDocPermissions'
    ).callsFake(async input => {
      const result = await batchPermissions(input);
      if (input.userId === owner.id) {
        checkedDocs.push(input.docs.map(doc => doc.docId).sort());
        if (checkedDocs.length === 1) {
          captured.resolve();
          await resume.promise;
        }
      }
      return result;
    });
    const workspaceCheck = app
      .get(EventBus)
      .emitAsync('workspace.updated', updatedWorkspace);
    await captured.promise;
    await db.$executeRaw`
      UPDATE workspace_sync_permission_generations
      SET generation = generation + 1
      WHERE workspace_id = ${workspace.id}
    `;
    const docCheck = app
      .get(EventBus)
      .emitAsync('backendRuntime.invalidation', {
        version: 1,
        kind: 'workspaceInventoryChanged',
        ...changed,
      });
    try {
      resume.resolve();
      await Promise.all([workspaceCheck, docCheck]);
    } finally {
      resume.resolve();
      await Promise.all([workspaceCheck, docCheck]);
      permissionStub.restore();
    }
    t.deepEqual(checkedDocs, [
      [docId, otherDocId, unrelatedDocId].sort(),
      [docId, otherDocId, unrelatedDocId].sort(),
    ]);
    const receivedAfterRace = waitForEvent<{ docId: string }>(
      ownerSocket,
      'space:broadcast-doc-updates'
    );
    unwrapResponse(
      t,
      await emitWithAck(otherOwnerSocket, 'space:push-doc-update', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId: otherDocId,
        intent: 'update',
        update: createYjsUpdateBase64(),
      })
    );
    t.is((await receivedAfterRace).docId, otherDocId);
  } finally {
    ownerSocket.disconnect();
    otherOwnerSocket.disconnect();
    collaboratorSocket.disconnect();
  }
});

test('awareness requires Doc.Read but not Doc.Update', async t => {
  const db = app.get(PrismaClient);
  const models = app.get(Models);
  const { user: owner, cookieHeader: ownerCookie } = await login(app);
  const { user: reader, cookieHeader: readerCookie } = await login(app);
  const workspace = await models.workspace.create(owner.id);
  const docId = 'awareness-reader-doc';

  await models.workspaceUser.set(
    workspace.id,
    reader.id,
    WorkspaceRole.Collaborator,
    { status: WorkspaceMemberStatus.Accepted }
  );
  await models.doc.setDefaultRole(workspace.id, docId, DocRole.None);
  await models.docUser.set(workspace.id, docId, reader.id, DocRole.Reader);
  await createSnapshot(db, {
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const ownerSocket = createClient(url, ownerCookie);
  const readerSocket = createClient(url, readerCookie);
  try {
    await Promise.all([
      waitForConnect(ownerSocket),
      waitForConnect(readerSocket),
    ]);

    for (const socket of [ownerSocket, readerSocket]) {
      const response = unwrapResponse(
        t,
        await emitWithAck<{ clientId: string; success: boolean }>(
          socket,
          'space:join-batch',
          {
            spaces: [
              { spaceType: 'workspace', spaceId: workspace.id },
              { spaceType: 'workspace', spaceId: workspace.id, docId },
            ],
            protocolVersion: 2,
            clientVersion: '0.27.5',
          }
        )
      );
      t.true(response.success);
    }

    const receivedAwareness = waitForEvent<{
      docId: string;
      awarenessUpdate: string;
    }>(readerSocket, 'space:broadcast-awareness-update');
    ownerSocket.emit('space:update-awareness', {
      spaceType: 'workspace',
      spaceId: workspace.id,
      docId,
      awarenessUpdate: 'AQID',
    });
    t.deepEqual(await receivedAwareness, {
      spaceType: 'workspace',
      spaceId: workspace.id,
      docId,
      awarenessUpdate: 'AQID',
    });

    const updateError = getErrorResponse(
      t,
      await emitWithAck(readerSocket, 'space:push-doc-update', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId,
        intent: 'update',
        update: createYjsUpdateBase64(),
      })
    );
    t.is(updateError.name, 'DOC_ACTION_DENIED');
  } finally {
    ownerSocket.disconnect();
    readerSocket.disconnect();
  }
});

test('active users metric should dedupe multiple sockets for one user', async t => {
  const db = app.get(PrismaClient);
  await ensureSyncActiveUsersTable(db);

  const { cookieHeader } = await login(app);
  const first = createClient(url, cookieHeader);
  const second = createClient(url, cookieHeader);

  try {
    await Promise.all([waitForConnect(first), waitForConnect(second)]);
    await waitForActiveUsers(db, 1);
    t.pass();
  } finally {
    first.disconnect();
    second.disconnect();
    await Promise.all([waitForDisconnect(first), waitForDisconnect(second)]);
  }
});

test('workspace sync delete-doc should enforce doc permissions', async t => {
  const db = app.get(PrismaClient);
  const models = app.get(Models);
  const { user: owner, cookieHeader: ownerCookieHeader } = await login(app);
  const { user: collaborator, cookieHeader } = await login(app);
  const workspace = await models.workspace.create(owner.id);
  const docId = 'private-doc';

  await models.workspaceUser.set(
    workspace.id,
    collaborator.id,
    WorkspaceRole.Collaborator,
    {
      status: WorkspaceMemberStatus.Accepted,
    }
  );
  await models.doc.setDefaultRole(workspace.id, docId, DocRole.None);
  const rootBlob = addDocToRootDoc(Buffer.from([0, 0]), docId, docId);
  await createSnapshot(db, {
    workspaceId: workspace.id,
    docId: workspace.id,
    userId: owner.id,
    blob: rootBlob,
  });
  await createSnapshot(db, {
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const socket = createClient(url, cookieHeader);
  const ownerSocket = createClient(url, ownerCookieHeader);

  try {
    await Promise.all([waitForConnect(socket), waitForConnect(ownerSocket)]);

    const join = unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        socket,
        'space:join-batch',
        {
          spaces: [{ spaceType: 'workspace', spaceId: workspace.id }],
          protocolVersion: 2,
          clientVersion: '0.27.5',
        }
      )
    );
    t.true(join.success);

    const error = getErrorResponse(
      t,
      await emitWithAck(socket, 'space:delete-doc', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId,
      })
    );
    t.true(error.message.includes('Doc.Delete'));

    const userdataError = getErrorResponse(
      t,
      await emitWithAck(socket, 'space:delete-doc', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId: `userdata$${owner.id}$${workspace.id}$docIntegrationRef`,
      })
    );
    t.is(userdataError.name, 'DOC_ACTION_DENIED');

    const ownerJoin = unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        ownerSocket,
        'space:join-batch',
        {
          spaces: [
            { spaceType: 'workspace', spaceId: workspace.id },
            {
              spaceType: 'workspace',
              spaceId: workspace.id,
              docId: workspace.id,
            },
          ],
          protocolVersion: 2,
          clientVersion: '0.27.5',
        }
      )
    );
    t.true(ownerJoin.success);

    const staleRoot = new Doc();
    applyUpdate(staleRoot, rootBlob);
    const state = encodeStateVector(staleRoot);
    const pages = staleRoot.getMap('meta').get('pages') as {
      get(index: number): { set(key: string, value: unknown): void };
    };
    pages.get(0).set('trash', true);
    const rootReceipt = unwrapResponse(
      t,
      await emitWithAck(ownerSocket, 'space:push-doc-update', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId: workspace.id,
        intent: 'update',
        update: Buffer.from(encodeStateAsUpdate(staleRoot, state)).toString(
          'base64'
        ),
      })
    );
    t.truthy(rootReceipt);
    t.is(
      (
        await db.workspaceDoc.findUnique({
          where: { workspaceId_docId: { workspaceId: workspace.id, docId } },
        })
      )?.lifecycleState ?? null,
      null
    );

    unwrapResponse(
      t,
      await emitWithAck(ownerSocket, 'space:delete-doc', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId,
      })
    );
    t.is(
      await db.snapshot.count({
        where: { workspaceId: workspace.id, id: docId },
      }),
      0
    );

    await db.$executeRaw`DELETE FROM storage_reconciliation_checkpoints WHERE kind='workspace_doc_lifecycle_activation' AND scope='global'`;
    const legacyWorkspace = await models.workspace.create(owner.id);
    await models.workspaceUser.set(
      legacyWorkspace.id,
      collaborator.id,
      WorkspaceRole.Collaborator,
      { status: WorkspaceMemberStatus.Accepted }
    );
    const logicalId = 'legacy-delete-page';
    const physicalId = 'legacy-delete-guid';
    const otherLogicalId = 'other-page-using-logical-id';
    const legacyRoot = new Doc();
    const legacyPages = new YArray<YMap<unknown>>();
    legacyRoot.getMap('meta').set('pages', legacyPages);
    legacyPages.push([new YMap([['id', logicalId]])]);
    legacyRoot.getMap('spaces').set(logicalId, new Doc({ guid: physicalId }));
    for (const id of [logicalId, physicalId, legacyWorkspace.id]) {
      await createSnapshot(db, {
        workspaceId: legacyWorkspace.id,
        docId: id,
        userId: owner.id,
        ...(id === legacyWorkspace.id
          ? { blob: Buffer.from(encodeStateAsUpdate(legacyRoot)) }
          : {}),
      });
    }
    const saveRoot = () =>
      db.snapshot.update({
        where: {
          workspaceId_id: {
            workspaceId: legacyWorkspace.id,
            id: legacyWorkspace.id,
          },
        },
        data: {
          blob: Buffer.from(encodeStateAsUpdate(legacyRoot)),
          updatedAt: new Date(),
        },
      });
    await models.doc.setDefaultRole(
      legacyWorkspace.id,
      logicalId,
      DocRole.None
    );
    await models.doc.setDefaultRole(
      legacyWorkspace.id,
      physicalId,
      DocRole.Manager
    );
    for (const id of [logicalId, physicalId]) {
      await app.get(BackendRuntimeProvider).executeDomainCommandV1({
        command: 'publish_doc',
        actorUserId: owner.id,
        workspaceId: legacyWorkspace.id,
        docId: id,
        mode: 0,
      });
    }
    for (const id of [logicalId, physicalId]) {
      await app
        .GET(`/api/workspaces/${legacyWorkspace.id}/public-docs/${id}`)
        .expect(200);
    }
    const legacySocket = createClient(url, cookieHeader);
    try {
      await waitForConnect(legacySocket);
      unwrapResponse(
        t,
        await emitWithAck(legacySocket, 'space:join-batch', {
          spaces: [{ spaceType: 'workspace', spaceId: legacyWorkspace.id }],
          protocolVersion: 1,
          clientVersion: '0.27.5',
        })
      );
      const request = {
        spaceType: 'workspace',
        spaceId: legacyWorkspace.id,
        docId: logicalId,
        physicalDocId: physicalId,
        lifecycle: 'delete',
      };
      t.is(
        getErrorResponse(
          t,
          await emitWithAck(legacySocket, 'space:doc-lifecycle', request)
        ).name,
        'DOC_ACTION_DENIED'
      );
      t.is(
        await db.snapshot.count({
          where: {
            workspaceId: legacyWorkspace.id,
            id: { in: [logicalId, physicalId] },
          },
        }),
        2
      );
      t.is(
        await db.workspaceDoc.count({
          where: { workspaceId: legacyWorkspace.id, lifecycleState: 'deleted' },
        }),
        0
      );
      await models.doc.setDefaultRole(
        legacyWorkspace.id,
        logicalId,
        DocRole.Manager
      );
      legacyPages.push([new YMap([['id', otherLogicalId]])]);
      legacyRoot
        .getMap('spaces')
        .set(otherLogicalId, new Doc({ guid: logicalId }));
      await saveRoot();
      t.is(
        getErrorResponse(
          t,
          await emitWithAck(legacySocket, 'space:doc-lifecycle', request)
        ).name,
        'BAD_REQUEST'
      );
      t.is(
        await db.snapshot.count({
          where: {
            workspaceId: legacyWorkspace.id,
            id: { in: [logicalId, physicalId] },
          },
        }),
        2
      );
      legacyPages.delete(1);
      legacyRoot.getMap('spaces').delete(otherLogicalId);
      await saveRoot();
      const deleted = unwrapResponse(
        t,
        await emitWithAck<{ timestamp: number; deletedDocIds: string[] }>(
          legacySocket,
          'space:doc-lifecycle',
          request
        )
      );
      t.deepEqual(deleted.deletedDocIds.sort(), [logicalId, physicalId].sort());
      t.is(
        await db.snapshot.count({
          where: {
            workspaceId: legacyWorkspace.id,
            id: { in: [logicalId, physicalId] },
          },
        }),
        0
      );
      const tombstones = await db.workspaceDoc.findMany({
        where: { workspaceId: legacyWorkspace.id, lifecycleState: 'deleted' },
        orderBy: { docId: 'asc' },
      });
      t.is(tombstones.length, 2);
      legacyPages.delete(0);
      legacyRoot.getMap('spaces').delete(logicalId);
      await saveRoot();
      const confirmed = unwrapResponse(
        t,
        await emitWithAck<{ timestamp: number; deletedDocIds: string[] }>(
          legacySocket,
          'space:doc-lifecycle',
          request
        )
      );
      t.deepEqual(confirmed, deleted);
      t.deepEqual(
        await db.workspaceDoc.findMany({
          where: { workspaceId: legacyWorkspace.id, lifecycleState: 'deleted' },
          orderBy: { docId: 'asc' },
        }),
        tombstones
      );
      getErrorResponse(
        t,
        await emitWithAck(legacySocket, 'space:push-doc-update', {
          spaceType: 'workspace',
          spaceId: legacyWorkspace.id,
          docId: physicalId,
          intent: 'create',
          update: Buffer.from([0, 0]).toString('base64'),
        })
      );
      for (const id of [logicalId, physicalId])
        await app
          .GET(`/api/workspaces/${legacyWorkspace.id}/public-docs/${id}`)
          .expect(403);
      await createSnapshot(db, {
        workspaceId: legacyWorkspace.id,
        docId: physicalId,
        userId: owner.id,
      });
      for (const id of [logicalId, physicalId])
        await app
          .GET(`/api/workspaces/${legacyWorkspace.id}/public-docs/${id}`)
          .expect(403);
      legacyPages.push([new YMap([['id', otherLogicalId]])]);
      legacyRoot
        .getMap('spaces')
        .set(otherLogicalId, new Doc({ guid: logicalId }));
      await saveRoot();
      t.deepEqual(
        unwrapResponse(
          t,
          await emitWithAck(legacySocket, 'space:doc-lifecycle', request)
        ),
        deleted
      );
      t.deepEqual(
        await db.workspaceDoc.findMany({
          where: { workspaceId: legacyWorkspace.id, lifecycleState: 'deleted' },
          orderBy: { docId: 'asc' },
        }),
        tombstones
      );
      const freshPhysicalId = 'fresh-source-after-delete';
      await createSnapshot(db, {
        workspaceId: legacyWorkspace.id,
        docId: freshPhysicalId,
        userId: owner.id,
      });
      getErrorResponse(
        t,
        await emitWithAck(legacySocket, 'space:doc-lifecycle', {
          ...request,
          physicalDocId: freshPhysicalId,
        })
      );
      t.is(
        await db.snapshot.count({
          where: { workspaceId: legacyWorkspace.id, id: freshPhysicalId },
        }),
        1
      );
      const absentLogicalId = 'absent-logical-namespace';
      legacyPages.push([new YMap([['id', absentLogicalId]])]);
      legacyRoot
        .getMap('spaces')
        .set(absentLogicalId, new Doc({ guid: freshPhysicalId }));
      await saveRoot();
      const absentDeleted = unwrapResponse(
        t,
        await emitWithAck<{ deletedDocIds: string[] }>(
          legacySocket,
          'space:doc-lifecycle',
          { ...request, docId: absentLogicalId, physicalDocId: freshPhysicalId }
        )
      );
      t.deepEqual(
        absentDeleted.deletedDocIds.sort(),
        [absentLogicalId, freshPhysicalId].sort()
      );
      t.is(
        (
          await db.workspaceDoc.findUnique({
            where: {
              workspaceId_docId: {
                workspaceId: legacyWorkspace.id,
                docId: absentLogicalId,
              },
            },
          })
        )?.lifecycleState,
        'deleted'
      );
    } finally {
      legacySocket.disconnect();
      legacyRoot.destroy();
    }
  } finally {
    socket.disconnect();
    ownerSocket.disconnect();
  }
});

test('workspace sync load-doc requires an active document subscription', async t => {
  const db = app.get(PrismaClient);
  const models = app.get(Models);
  const { user: owner } = await login(app);
  const { user: collaborator, cookieHeader } = await login(app);
  const workspace = await models.workspace.create(owner.id);
  const docId = 'private-load-doc';

  await models.workspaceUser.set(
    workspace.id,
    collaborator.id,
    WorkspaceRole.Collaborator,
    {
      status: WorkspaceMemberStatus.Accepted,
    }
  );
  await models.doc.setDefaultRole(workspace.id, docId, DocRole.None);
  await models.docUser.set(
    workspace.id,
    docId,
    collaborator.id,
    DocRole.Reader
  );
  await createSnapshot(db, {
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const socket = createClient(url, cookieHeader);

  try {
    await waitForConnect(socket);

    const join = unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        socket,
        'space:join-batch',
        {
          spaces: [{ spaceType: 'workspace', spaceId: workspace.id }],
          protocolVersion: 2,
          clientVersion: '0.27.5',
        }
      )
    );
    t.true(join.success);

    const error = getErrorResponse(
      t,
      await emitWithAck(socket, 'space:load-doc', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId,
      })
    );
    t.snapshot(stableError(error, workspace.id));

    const userdataError = getErrorResponse(
      t,
      await emitWithAck(socket, 'space:load-doc', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId: `userdata$${owner.id}$${workspace.id}$favorite`,
      })
    );
    t.is(userdataError.name, 'NOT_IN_SPACE');
    const joinDoc = () =>
      emitWithAck(socket, 'space:join-batch', {
        spaces: [{ spaceType: 'workspace', spaceId: workspace.id, docId }],
        protocolVersion: 2,
        clientVersion: '0.27.5',
      });
    for (const renewed of [false, true]) {
      await models.docUser.set(
        workspace.id,
        docId,
        collaborator.id,
        DocRole.Reader
      );
      unwrapResponse(t, await joinDoc());
      const reader = app.get(DocReader);
      const load = reader.getDocDiff.bind(reader);
      const race = Sinon.stub(reader, 'getDocDiff').callsFake(
        async (...args) => {
          const result = await load(...args);
          const where = {
            workspaceId: workspace.id,
            docId,
            principalType: 'user',
            principalId: collaborator.id,
          };
          if (renewed) {
            await db.docGrant.updateMany({ where, data: { role: 'editor' } });
            unwrapResponse(t, await joinDoc());
          } else {
            await db.docGrant.deleteMany({ where });
          }
          return result;
        }
      );
      try {
        const raced = getErrorResponse(
          t,
          await emitWithAck(socket, 'space:load-doc', {
            spaceType: 'workspace',
            spaceId: workspace.id,
            docId,
          })
        );
        t.is(raced.name, 'NOT_IN_SPACE');
      } finally {
        race.restore();
      }
      if (renewed)
        unwrapResponse(
          t,
          await emitWithAck(socket, 'space:load-doc', {
            spaceType: 'workspace',
            spaceId: workspace.id,
            docId,
          })
        );
    }
  } finally {
    socket.disconnect();
  }
});

test('workspace sync push-doc-update should enforce doc update permissions', async t => {
  const db = app.get(PrismaClient);
  const models = app.get(Models);
  const { user: owner } = await login(app);
  const { user: collaborator, cookieHeader } = await login(app);
  const workspace = await models.workspace.create(owner.id);
  const docId = 'readonly-push-doc';

  await models.workspaceUser.set(
    workspace.id,
    collaborator.id,
    WorkspaceRole.Collaborator,
    {
      status: WorkspaceMemberStatus.Accepted,
    }
  );
  await models.doc.setDefaultRole(workspace.id, docId, DocRole.None);
  await models.docUser.set(
    workspace.id,
    docId,
    collaborator.id,
    DocRole.Reader
  );
  await createSnapshot(db, {
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const socket = createClient(url, cookieHeader);

  try {
    await waitForConnect(socket);

    const join = unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        socket,
        'space:join-batch',
        {
          spaces: [
            { spaceType: 'workspace', spaceId: workspace.id },
            { spaceType: 'workspace', spaceId: workspace.id, docId },
          ],
          protocolVersion: 2,
          clientVersion: '0.27.5',
        }
      )
    );
    t.true(join.success);

    const error = getErrorResponse(
      t,
      await emitWithAck(socket, 'space:push-doc-update', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId,
        intent: 'update',
        update: createYjsUpdateBase64(),
      })
    );
    t.true(error.message.includes('Doc.Update'));

    const userdataError = getErrorResponse(
      t,
      await emitWithAck(socket, 'space:push-doc-update', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId: `userdata$${owner.id}$${workspace.id}$settings`,
        intent: 'update',
        update: createYjsUpdateBase64(),
      })
    );
    t.is(userdataError.name, 'NOT_IN_SPACE');

    const malformedDatabaseError = getErrorResponse(
      t,
      await emitWithAck(socket, 'space:push-doc-update', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId: 'db$docProperties',
        intent: 'update',
        update: createYjsUpdateBase64(),
      })
    );
    t.is(malformedDatabaseError.name, 'NOT_IN_SPACE');

    const updates = await db.update.count({
      where: {
        workspaceId: workspace.id,
        id: docId,
      },
    });
    t.is(updates, 0);
  } finally {
    socket.disconnect();
  }
});

test('workspace sync load-doc-timestamps should filter unreadable docs', async t => {
  const db = app.get(PrismaClient);
  const models = app.get(Models);
  const { user: owner } = await login(app);
  const { user: collaborator, cookieHeader } = await login(app);
  const workspace = await models.workspace.create(owner.id);
  const privateDocId = 'private-timestamp-doc';
  const readableDocId = 'readable-timestamp-doc';

  await models.workspaceUser.set(
    workspace.id,
    collaborator.id,
    WorkspaceRole.Collaborator,
    {
      status: WorkspaceMemberStatus.Accepted,
    }
  );
  await models.doc.setDefaultRole(workspace.id, privateDocId, DocRole.None);
  await models.doc.setDefaultRole(workspace.id, readableDocId, DocRole.None);
  await models.docUser.set(
    workspace.id,
    readableDocId,
    collaborator.id,
    DocRole.Reader
  );
  await createSnapshot(db, {
    workspaceId: workspace.id,
    docId: privateDocId,
    userId: owner.id,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  await createSnapshot(db, {
    workspaceId: workspace.id,
    docId: readableDocId,
    userId: owner.id,
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  });

  const socket = createClient(url, cookieHeader);

  try {
    await waitForConnect(socket);

    const join = unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        socket,
        'space:join-batch',
        {
          spaces: [{ spaceType: 'workspace', spaceId: workspace.id }],
          protocolVersion: 2,
          clientVersion: '0.27.5',
        }
      )
    );
    t.true(join.success);

    const timestamps = unwrapResponse(
      t,
      await emitWithAck<Record<string, number>>(
        socket,
        'space:load-doc-timestamps',
        {
          spaceType: 'workspace',
          spaceId: workspace.id,
        }
      )
    );

    t.false(privateDocId in timestamps);
    t.true(readableDocId in timestamps);
    await models.doc.publish(workspace.id, readableDocId);
    await db.workspaceMember.updateMany({
      where: { workspaceId: workspace.id, userId: collaborator.id },
      data: { state: 'suspended' },
    });
    const denied = getErrorResponse(
      t,
      await emitWithAck(socket, 'space:load-doc-timestamps', {
        spaceType: 'workspace',
        spaceId: workspace.id,
      })
    );
    t.is(denied.name, 'SPACE_ACCESS_DENIED');
  } finally {
    socket.disconnect();
  }
});
