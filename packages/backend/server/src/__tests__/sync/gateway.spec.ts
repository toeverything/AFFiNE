import { PrismaClient } from '@prisma/client';
import test, { type ExecutionContext } from 'ava';
import { io, type Socket as SocketIOClient } from 'socket.io-client';
import { Doc, encodeStateAsUpdate } from 'yjs';

import { CANARY_CLIENT_VERSION_MAX_AGE_DAYS, EventBus } from '../../base';
import {
  DocRole,
  Models,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from '../../models';
import { createTestingApp, TestingApp } from '../utils';

type WebsocketResponse<T> =
  | { error: { name: string; message: string } }
  | { data: T };

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
): { name: string; message: string } {
  if ('error' in res) return res.error;

  t.log(res);
  throw new Error(`Expected websocket error response, got data instead`);
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

function waitForEvent<T>(socket: SocketIOClient, event: string) {
  return withTimeout(
    new Promise<T>(resolve => {
      socket.once(event, (payload: T) => resolve(payload));
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
      blob: input.blob ?? Buffer.from([1, 1]),
      state: input.state ?? Buffer.from([1, 1]),
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

test('clientVersion>=0.26.0 should receive legacy space:broadcast-doc-updates', async t => {
  const { user, cookieHeader } = await loginWithCookie(app);
  const spaceId = user.id;
  const update = createYjsUpdateBase64();

  const sender = createClient(url, cookieHeader);
  const receiver = createClient(url, cookieHeader);

  try {
    await Promise.all([waitForConnect(sender), waitForConnect(receiver)]);

    const receiverJoin = unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        receiver,
        'space:join',
        { spaceType: 'userspace', spaceId, clientVersion: '0.26.7' }
      )
    );
    t.true(receiverJoin.success);

    const senderJoin = unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        sender,
        'space:join',
        { spaceType: 'userspace', spaceId, clientVersion: '0.26.0' }
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
        docId: 'doc-2',
        update,
      }
    );
    unwrapResponse(t, pushRes);

    const message = await onUpdates;
    t.is(message.spaceType, 'userspace');
    t.is(message.spaceId, spaceId);
    t.is(message.docId, 'doc-2');
    t.deepEqual(message.updates, [update]);
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

test('clientVersion<0.26.0 should be rejected and disconnected', async t => {
  const { user, cookieHeader } = await login(app);
  const spaceId = user.id;

  const socket = createClient(url, cookieHeader);
  try {
    await waitForConnect(socket);

    const res = unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        socket,
        'space:join',
        { spaceType: 'userspace', spaceId, clientVersion: '0.25.0' }
      )
    );
    t.false(res.success);

    await waitForDisconnect(socket);
  } finally {
    socket.disconnect();
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
          'space:join',
          {
            spaceType: 'userspace',
            spaceId,
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
          'space:join',
          {
            spaceType: 'userspace',
            spaceId,
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

test('space:join-awareness should reject clientVersion<0.26.0', async t => {
  const { user, cookieHeader } = await login(app);
  const spaceId = user.id;

  const socket = createClient(url, cookieHeader);
  try {
    await waitForConnect(socket);

    const res = unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        socket,
        'space:join-awareness',
        {
          spaceType: 'userspace',
          spaceId,
          docId: 'doc-awareness',
          clientVersion: '0.25.0',
        }
      )
    );
    t.false(res.success);

    await waitForDisconnect(socket);
  } finally {
    socket.disconnect();
  }
});

test('new clients must use batch join endpoints on new servers', async t => {
  const { user, cookieHeader } = await login(app);
  const requests = [
    {
      event: 'space:join',
      payload: {
        spaceType: 'userspace',
        spaceId: user.id,
        clientVersion: '0.27.5',
      },
    },
    {
      event: 'space:join-awareness',
      payload: {
        spaceType: 'userspace',
        spaceId: user.id,
        docId: 'doc-awareness',
        clientVersion: '0.27.5',
      },
    },
  ] as const;

  for (const request of requests) {
    const socket = createClient(url, cookieHeader);
    try {
      await waitForConnect(socket);
      const result = unwrapResponse(
        t,
        await emitWithAck<{ clientId: string; success: boolean }>(
          socket,
          request.event,
          request.payload
        )
      );
      t.false(result.success);
      await waitForDisconnect(socket);
    } finally {
      socket.disconnect();
    }
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
          clientVersion: '0.27.5',
        },
      },
      {
        label: 'invalid entry',
        payload: {
          spaces: [{ spaceType: 'invalid', spaceId }],
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

test('space:join-batch should reject clients before 0.27.5', async t => {
  const { user, cookieHeader } = await login(app);
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
          clientVersion: '0.27.4',
        }
      )
    );
    t.false(result.success);
    await waitForDisconnect(socket);
  } finally {
    socket.disconnect();
  }
});

test('space:join-batch should authorize once and join all requested rooms', async t => {
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
      ],
      clientVersion: '0.27.5',
    };

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
          { spaceType: 'workspace', spaceId: workspace.id, docId },
        ],
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

test('permission revocation removes a active document subscription', async t => {
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
    DocRole.Reader
  );
  await createSnapshot(db, {
    workspaceId: workspace.id,
    docId,
    userId: owner.id,
  });

  const ownerSocket = createClient(url, ownerCookie);
  const collaboratorSocket = createClient(url, collaboratorCookie);
  try {
    await Promise.all([
      waitForConnect(ownerSocket),
      waitForConnect(collaboratorSocket),
    ]);

    for (const socket of [ownerSocket, collaboratorSocket]) {
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
            clientVersion: '0.27.5',
          }
        )
      );
      t.true(response.success);
    }

    await models.docUser.delete(workspace.id, docId, collaborator.id);
    await app.get(EventBus).emitAsync('doc.grants.changed', {
      workspaceId: workspace.id,
      docId,
    });

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
        update: createYjsUpdateBase64(),
      })
    );
    await noRevokedUpdate;
  } finally {
    ownerSocket.disconnect();
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
        'space:join',
        {
          spaceType: 'workspace',
          spaceId: workspace.id,
          clientVersion: '0.26.0',
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
    t.is(userdataError.name, 'SPACE_ACCESS_DENIED');

    const ownerJoin = unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        ownerSocket,
        'space:join',
        {
          spaceType: 'workspace',
          spaceId: workspace.id,
          clientVersion: '0.26.0',
        }
      )
    );
    t.true(ownerJoin.success);
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
      1
    );
  } finally {
    socket.disconnect();
    ownerSocket.disconnect();
  }
});

test('workspace sync load-doc should enforce doc read permissions', async t => {
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
        'space:join',
        {
          spaceType: 'workspace',
          spaceId: workspace.id,
          clientVersion: '0.26.0',
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
    t.true(error.message.includes('Doc.Read'));

    const userdataError = getErrorResponse(
      t,
      await emitWithAck(socket, 'space:load-doc', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId: `userdata$${owner.id}$${workspace.id}$favorite`,
      })
    );
    t.is(userdataError.name, 'SPACE_ACCESS_DENIED');
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
        'space:join',
        {
          spaceType: 'workspace',
          spaceId: workspace.id,
          clientVersion: '0.26.0',
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
        update: createYjsUpdateBase64(),
      })
    );
    t.is(userdataError.name, 'SPACE_ACCESS_DENIED');

    const malformedDatabaseError = getErrorResponse(
      t,
      await emitWithAck(socket, 'space:push-doc-update', {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId: 'db$docProperties',
        update: createYjsUpdateBase64(),
      })
    );
    t.is(malformedDatabaseError.name, 'SPACE_ACCESS_DENIED');

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
        'space:join',
        {
          spaceType: 'workspace',
          spaceId: workspace.id,
          clientVersion: '0.26.0',
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
  } finally {
    socket.disconnect();
  }
});
