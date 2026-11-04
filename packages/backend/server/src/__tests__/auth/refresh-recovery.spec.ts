import { randomUUID } from 'node:crypto';

import {
  AuthSessionError,
  AuthTokenBroker,
  type AuthTokenPair,
  type AuthTokenResponse,
  type AuthTokenStorage,
  classifyAuthHttpError,
} from '@affine/auth';
import { PrismaClient } from '@prisma/client';
import ava, { type TestFn } from 'ava';

import { createTestingApp, type TestingApp } from '../utils';

const test = ava.serial as TestFn<{ app: TestingApp; db: PrismaClient }>;
const interruption = 27 * 60_000;

test.before(async t => {
  const app = await createTestingApp();
  t.context = { app, db: app.get(PrismaClient) };
});

test.beforeEach(async t => {
  await t.context.app.initTestingDB();
});

test.after.always(async t => {
  await t.context.app?.close();
});

async function recoveryClient(app: TestingApp) {
  const user = await app.createUser(
    `refresh-recovery-${randomUUID()}@example.invalid`
  );
  const issued = await app.createNativeAuthSession(user.id, {
    platform: 'electron',
    appVersion: '0.27.5',
  });
  // Serialize storage to prevent brokers from sharing mutable token objects.
  let encoded: string | null = null;
  let clock = Date.now();
  let requests = 0;
  let lostResponses = 0;
  let failureCode = 'NETWORK_ERROR';
  let failSaveAfterResponse = false;
  let failSave = false;
  const storage: AuthTokenStorage = {
    load: async () => (encoded === null ? null : JSON.parse(encoded)),
    save: async pair => {
      if (failSave) throw new Error('test secure storage unavailable');
      encoded = JSON.stringify(pair);
    },
    clear: async () => {
      encoded = null;
    },
  };
  const transport = {
    async refresh(
      refreshToken: string,
      requestId?: string
    ): Promise<AuthTokenResponse> {
      requests++;
      const request = app
        .POST('/api/auth/session/refresh')
        .set('x-affine-client-kind', 'native')
        .set('x-affine-version', '0.27.5')
        .set('Origin', 'https://localhost');
      const response = await request.send({
        refreshToken,
        refreshRequestId: requestId,
      });
      if (response.status !== 201) {
        throw classifyAuthHttpError(response.status, response.body);
      }
      // Drop the reply only after the real endpoint commits the rotation.
      if (lostResponses > 0) {
        lostResponses--;
        throw new AuthSessionError(failureCode, true);
      }
      if (failSaveAfterResponse) failSave = true;
      return response.body;
    },
  };
  const restart = () =>
    new AuthTokenBroker(storage, transport, {
      now: () => clock,
      createRefreshRequestId: randomUUID,
      retryDelays: [],
    });
  const broker = restart();
  await broker.set(issued);
  return {
    broker,
    issued,
    restart,
    requests: () => requests,
    stored: () =>
      encoded === null ? null : (JSON.parse(encoded) as AuthTokenPair),
    loseResponses(count: number, code = 'NETWORK_ERROR') {
      lostResponses = count;
      failureCode = code;
    },
    failRotatedPairSave() {
      failSaveAfterResponse = true;
    },
    restoreStorage() {
      failSave = false;
      failSaveAfterResponse = false;
    },
    async sleepBeyondGrace() {
      clock += interruption;
      // Expire grace without expiring the successor or session.
      await app.get(PrismaClient).authRefreshToken.updateMany({
        where: { authSessionId: issued.session.id, usedAt: { not: null } },
        data: { usedAt: new Date(Date.now() - interruption) },
      });
    },
  };
}

async function sessionFacts(db: PrismaClient, id: string) {
  const session = await db.authSession.findUniqueOrThrow({ where: { id } });
  const generations = await db.authRefreshToken.count({
    where: { authSessionId: id },
  });
  return { revokedAt: session.revokedAt, generations };
}

async function ageSession(db: PrismaClient, id: string, days: number) {
  // Translate all persisted lifetime facts together. Changing only usedAt
  // would simulate grace expiry while accidentally retaining a fresh lifetime.
  await db.$transaction([
    db.$executeRaw`UPDATE user_sessions
      SET expires_at=expires_at-make_interval(days => ${days}::int)
      WHERE id=(SELECT user_session_id FROM auth_sessions WHERE id=${id})`,
    db.$executeRaw`UPDATE auth_sessions
      SET created_at=created_at-make_interval(days => ${days}::int),
          last_seen_at=last_seen_at-make_interval(days => ${days}::int),
          idle_expires_at=idle_expires_at-make_interval(days => ${days}::int),
          absolute_expires_at=absolute_expires_at-make_interval(days => ${days}::int)
      WHERE id=${id}`,
    db.$executeRaw`UPDATE auth_refresh_tokens
      SET created_at=created_at-make_interval(days => ${days}::int),
          expires_at=expires_at-make_interval(days => ${days}::int),
          used_at=used_at-make_interval(days => ${days}::int),
          grace_used_at=grace_used_at-make_interval(days => ${days}::int),
          successor_expires_at=successor_expires_at-make_interval(days => ${days}::int)
      WHERE auth_session_id=${id}`,
  ]);
}

async function lifetimeFacts(db: PrismaClient, id: string) {
  return db.authSession.findUniqueOrThrow({
    where: { id },
    select: {
      idleExpiresAt: true,
      absoluteExpiresAt: true,
      lastSeenAt: true,
      refreshTokens: {
        orderBy: { generation: 'asc' },
        select: { expiresAt: true, successorExpiresAt: true },
      },
    },
  });
}

for (const days of [3, 7, 14]) {
  test(`lost committed reply survives a ${days}-day interruption without extending lifetimes`, async t => {
    const { app, db } = t.context;
    const client = await recoveryClient(app);
    client.loseResponses(1);
    await t.throwsAsync(() => client.broker.refresh('lost-before-break'), {
      message: 'NETWORK_ERROR',
    });
    await ageSession(db, client.issued.session.id, days);
    const before = await lifetimeFacts(db, client.issued.session.id);
    t.deepEqual(
      before.refreshTokens[0].successorExpiresAt,
      before.refreshTokens[0].expiresAt
    );
    const restarted = client.restart();
    await Promise.all(
      Array.from({ length: 25 }, () => restarted.refresh('after-break'))
    );
    t.is(client.requests(), 2);
    t.is(client.stored()?.refreshRequestId, undefined);
    t.true(client.stored()?.refreshToken !== client.issued.refreshToken);
    t.deepEqual(await lifetimeFacts(db, client.issued.session.id), before);
    t.deepEqual(await sessionFacts(db, client.issued.session.id), {
      revokedAt: null,
      generations: 2,
    });
  });
}

for (const deadline of ['idle', 'absolute', 'user-session'] as const) {
  test(`pending recovery cannot bypass ${deadline} expiry`, async t => {
    const { app, db } = t.context;
    const client = await recoveryClient(app);
    client.loseResponses(1);
    await t.throwsAsync(() => client.broker.refresh('lost-before-expiry'), {
      message: 'NETWORK_ERROR',
    });
    const expired = new Date(Date.now() - 1000);
    if (deadline === 'user-session') {
      const session = await db.authSession.findUniqueOrThrow({
        where: { id: client.issued.session.id },
      });
      await db.userSession.update({
        where: { id: session.userSessionId },
        data: { expiresAt: expired },
      });
    } else {
      await db.authSession.update({
        where: { id: client.issued.session.id },
        data:
          deadline === 'idle'
            ? { idleExpiresAt: expired }
            : { absoluteExpiresAt: expired },
      });
    }
    await t.throwsAsync(() => client.restart().refresh('after-expiry'), {
      message: 'AUTH_SESSION_EXPIRED',
    });
    t.is(client.stored(), null);
    t.deepEqual(await sessionFacts(db, client.issued.session.id), {
      revokedAt: null,
      generations: 2,
    });
  });
}

for (const code of ['NETWORK_ERROR', 'AUTH_REQUEST_TIMEOUT']) {
  test(`lost committed response (${code}) survives restart, sleep and concurrent retry`, async t => {
    const { app, db } = t.context;
    const client = await recoveryClient(app);
    client.loseResponses(1, code);
    await t.throwsAsync(() => client.broker.refresh('before-sleep'), {
      message: code,
    });
    const journal = client.stored();
    t.true(journal?.refreshToken === client.issued.refreshToken);
    t.truthy(journal?.refreshRequestId);
    t.deepEqual(await sessionFacts(db, client.issued.session.id), {
      revokedAt: null,
      generations: 2,
    });
    await client.sleepBeyondGrace();

    const restarted = client.restart();
    const recovered = await Promise.all(
      Array.from({ length: 25 }, () => restarted.refresh('after-wake'))
    );
    t.true(
      recovered.every(pair => pair.accessToken === recovered[0].accessToken)
    );
    t.is(client.requests(), 2);
    t.true(client.stored()?.refreshToken !== client.issued.refreshToken);
    t.is(client.stored()?.refreshRequestId, undefined);
    t.deepEqual(await sessionFacts(db, client.issued.session.id), {
      revokedAt: null,
      generations: 2,
    });
  });
}

test('losing recovery replies across repeated restarts never consumes the recovery path', async t => {
  const { app, db } = t.context;
  const client = await recoveryClient(app);
  client.loseResponses(3);
  let operation: string | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    await t.throwsAsync(() => client.restart().refresh('lost-reply'), {
      message: 'NETWORK_ERROR',
    });
    const stored = client.stored();
    operation ??= stored?.refreshRequestId;
    t.truthy(operation);
    t.true(stored?.refreshRequestId === operation);
    t.true(stored?.refreshToken === client.issued.refreshToken);
    t.deepEqual(await sessionFacts(db, client.issued.session.id), {
      revokedAt: null,
      generations: 2,
    });
    await client.sleepBeyondGrace();
  }
  await client.restart().refresh('response-finally-delivered');
  t.is(client.requests(), 4);
  t.is(client.stored()?.refreshRequestId, undefined);
  t.deepEqual(await sessionFacts(db, client.issued.session.id), {
    revokedAt: null,
    generations: 2,
  });
});

test('restart after failure to save N+1 recovers the committed successor from the durable journal', async t => {
  const { app, db } = t.context;
  const client = await recoveryClient(app);
  client.failRotatedPairSave();
  await t.throwsAsync(() => client.broker.refresh('rotation'), {
    message: 'AUTH_TOKEN_STORAGE_UNAVAILABLE',
  });
  t.true(client.stored()?.refreshToken === client.issued.refreshToken);
  t.truthy(client.stored()?.refreshRequestId);
  await client.sleepBeyondGrace();
  client.restoreStorage();
  // Discard the first broker's pending N+1: only its journal survives a crash.
  await client.restart().refresh('after-crash');
  t.is(client.requests(), 2);
  t.true(client.stored()?.refreshToken !== client.issued.refreshToken);
  t.is(client.stored()?.refreshRequestId, undefined);
  t.deepEqual(await sessionFacts(db, client.issued.session.id), {
    revokedAt: null,
    generations: 2,
  });
});

test('a durable recovery operation cannot resurrect an explicitly revoked session', async t => {
  const { app, db } = t.context;
  const client = await recoveryClient(app);
  client.loseResponses(1);
  await t.throwsAsync(() => client.broker.refresh('lost-reply'), {
    message: 'NETWORK_ERROR',
  });
  await app
    .DELETE(`/api/auth/sessions/${client.issued.session.id}`)
    .set('Authorization', `Bearer ${client.issued.accessToken}`)
    .expect(200);
  await client.sleepBeyondGrace();
  const restarted = client.restart();
  await t.throwsAsync(() => restarted.refresh('after-revoke'), {
    message: 'AUTH_SESSION_REVOKED',
  });
  t.is(client.stored(), null);
  t.is(await restarted.getValidAccessToken(), null);
  t.truthy((await sessionFacts(db, client.issued.session.id)).revokedAt);
  const retained = await db.authRefreshToken.count({
    where: {
      authSessionId: client.issued.session.id,
      successorCiphertext: { not: null },
    },
  });
  t.is(retained, 0);
});

for (const attempt of ['missing', 'different'] as const) {
  test(`a keyed rotation rejects a ${attempt} operation even within legacy grace`, async t => {
    const { app, db } = t.context;
    const client = await recoveryClient(app);
    client.loseResponses(1);
    await t.throwsAsync(() => client.broker.refresh('lost-reply'), {
      message: 'NETWORK_ERROR',
    });
    const response = await app
      .POST('/api/auth/session/refresh')
      .set('x-affine-client-kind', 'native')
      .set('Origin', 'https://localhost')
      .send({
        refreshToken: client.issued.refreshToken,
        refreshRequestId: attempt === 'different' ? randomUUID() : undefined,
      })
      .expect(401);
    t.is(response.body.code, 'REFRESH_TOKEN_REUSED');
    await t.throwsAsync(() => client.restart().refresh('after-replay'), {
      message: 'AUTH_SESSION_REVOKED',
    });
    t.is(client.stored(), null);
    t.is(
      await db.authRefreshToken.count({
        where: {
          authSessionId: client.issued.session.id,
          successorCiphertext: { not: null },
        },
      }),
      0
    );
  });
}

test('retrying a captured operation revokes an attacker chain after its successor was consumed', async t => {
  const { app, db } = t.context;
  const client = await recoveryClient(app);
  client.loseResponses(1);
  await t.throwsAsync(() => client.broker.refresh('lost-reply'), {
    message: 'NETWORK_ERROR',
  });
  const operation = client.stored()?.refreshRequestId;
  t.truthy(operation);
  const refresh = (
    refreshToken: string,
    refreshRequestId: string | undefined
  ) =>
    app
      .POST('/api/auth/session/refresh')
      .set('x-affine-client-kind', 'native')
      .send({ refreshToken, refreshRequestId });
  const recovered = await refresh(client.issued.refreshToken, operation).expect(
    201
  );
  const advanced = await refresh(
    recovered.body.refreshToken,
    randomUUID()
  ).expect(201);
  await t.throwsAsync(() => client.restart().refresh('legitimate-retry'), {
    message: 'REFRESH_TOKEN_REUSED',
  });
  t.is(client.stored(), null);
  t.truthy((await sessionFacts(db, client.issued.session.id)).revokedAt);
  t.is(
    await db.authRefreshToken.count({
      where: {
        authSessionId: client.issued.session.id,
        successorCiphertext: { not: null },
      },
    }),
    0
  );
  const revoked = await refresh(
    advanced.body.refreshToken,
    randomUUID()
  ).expect(401);
  t.is(revoked.body.code, 'AUTH_SESSION_REVOKED');
});

for (const missing of [false, true]) {
  test(`unrecoverable keyed material (${missing ? 'missing' : 'corrupt'}) closes the family without misreporting replay`, async t => {
    const { app, db } = t.context;
    const client = await recoveryClient(app);
    client.loseResponses(1);
    await t.throwsAsync(() => client.broker.refresh('lost-reply'), {
      message: 'NETWORK_ERROR',
    });
    await db.authRefreshToken.updateMany({
      where: { authSessionId: client.issued.session.id, usedAt: { not: null } },
      data: missing
        ? { successorCiphertext: null, successorExpiresAt: null }
        : { successorCiphertext: 'invalid-test-envelope' },
    });
    await t.throwsAsync(() => client.restart().refresh('unrecoverable'), {
      message: 'AUTH_SESSION_RECOVERY_REQUIRED',
    });
    t.is(client.stored(), null);
    t.truthy((await sessionFacts(db, client.issued.session.id)).revokedAt);
    t.is(
      (
        await db.authSession.findUniqueOrThrow({
          where: { id: client.issued.session.id },
        })
      ).revokeReason,
      'refresh_recovery_unavailable'
    );
    t.is(
      await db.authRefreshToken.count({
        where: {
          authSessionId: client.issued.session.id,
          successorCiphertext: { not: null },
        },
      }),
      0
    );
  });
}
