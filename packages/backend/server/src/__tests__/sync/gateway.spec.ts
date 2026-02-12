import { PrismaClient } from '@prisma/client';
import test, { type ExecutionContext } from 'ava';
import { io, type Socket as SocketIOClient } from 'socket.io-client';
import { Doc, encodeStateAsUpdate } from 'yjs';

import { CANARY_CLIENT_VERSION_MAX_AGE_DAYS } from '../../base';
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

function createClient(url: string, cookie: string): SocketIOClient {
  return io(url, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    extraHeaders: {
      cookie,
    },
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
  const user = await app.createUser('u1@affine.pro');
  const res = await app
    .POST('/api/auth/sign-in')
    .send({ email: user.email, password: user.password })
    .expect(200);

  const cookies = res.get('Set-Cookie') ?? [];
  const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
  return { user, cookieHeader };
}

function createYjsUpdateBase64() {
  const doc = new Doc();
  doc.getMap('m').set('k', 'v');
  const update = encodeStateAsUpdate(doc);
  return Buffer.from(update).toString('base64');
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

test('clientVersion=0.25.0 should only receive space:broadcast-doc-update', async t => {
  const { user, cookieHeader } = await login(app);
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
        { spaceType: 'userspace', spaceId, clientVersion: '0.25.0' }
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

    const onUpdate = waitForEvent<{
      spaceType: string;
      spaceId: string;
      docId: string;
      update: string;
    }>(receiver, 'space:broadcast-doc-update');
    const noUpdates = expectNoEvent(receiver, 'space:broadcast-doc-updates');

    const pushRes = await emitWithAck<{ accepted: true; timestamp?: number }>(
      sender,
      'space:push-doc-update',
      {
        spaceType: 'userspace',
        spaceId,
        docId: 'doc-1',
        update,
      }
    );
    unwrapResponse(t, pushRes);

    const message = await onUpdate;
    t.is(message.spaceType, 'userspace');
    t.is(message.spaceId, spaceId);
    t.is(message.docId, 'doc-1');
    t.is(message.update, update);

    await noUpdates;
  } finally {
    sender.disconnect();
    receiver.disconnect();
  }
});

test('clientVersion>=0.26.0 should only receive space:broadcast-doc-updates', async t => {
  const { user, cookieHeader } = await login(app);
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
        { spaceType: 'userspace', spaceId, clientVersion: '0.26.0' }
      )
    );
    t.true(receiverJoin.success);

    const senderJoin = unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        sender,
        'space:join',
        { spaceType: 'userspace', spaceId, clientVersion: '0.25.0' }
      )
    );
    t.true(senderJoin.success);

    const onUpdates = waitForEvent<{
      spaceType: string;
      spaceId: string;
      docId: string;
      updates: string[];
    }>(receiver, 'space:broadcast-doc-updates');
    const noUpdate = expectNoEvent(receiver, 'space:broadcast-doc-update');

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

    await noUpdate;
  } finally {
    sender.disconnect();
    receiver.disconnect();
  }
});

test('canary date clientVersion should use sync-026 in canary namespace', async t => {
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

      const receiverJoin = unwrapResponse(
        t,
        await emitWithAck<{ clientId: string; success: boolean }>(
          receiver,
          'space:join',
          {
            spaceType: 'userspace',
            spaceId,
            clientVersion: makeCanaryDateVersion(new Date(), '015'),
          }
        )
      );
      t.true(receiverJoin.success);

      const senderJoin = unwrapResponse(
        t,
        await emitWithAck<{ clientId: string; success: boolean }>(
          sender,
          'space:join',
          { spaceType: 'userspace', spaceId, clientVersion: '0.25.0' }
        )
      );
      t.true(senderJoin.success);

      const onUpdates = waitForEvent<{
        spaceType: string;
        spaceId: string;
        docId: string;
        updates: string[];
      }>(receiver, 'space:broadcast-doc-updates');
      const noUpdate = expectNoEvent(receiver, 'space:broadcast-doc-update');

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

      await noUpdate;
    } finally {
      sender.disconnect();
      receiver.disconnect();
    }
  } finally {
    // @ts-expect-error test
    env.NAMESPACE = prevNamespace;
  }
});

test('clientVersion<0.25.0 should be rejected and disconnected', async t => {
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
        { spaceType: 'userspace', spaceId, clientVersion: '0.24.4' }
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

test('space:join-awareness should reject clientVersion<0.25.0', async t => {
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
          clientVersion: '0.24.4',
        }
      )
    );
    t.false(res.success);

    await waitForDisconnect(socket);
  } finally {
    socket.disconnect();
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
