import { createHash } from 'node:crypto';

import { Prisma, PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { Cache, ConfigFactory, EventBus } from '../../base';
import {
  AuthModule,
  AuthService,
  AuthSessionService,
  AuthSigningKeyRing,
} from '../../core/auth';
import { Models } from '../../models';
import { createTestingApp, TestingApp } from '../utils';

const test = ava as TestFn<{
  app: TestingApp;
  auth: AuthService;
  cache: Cache;
  config: ConfigFactory;
  db: PrismaClient;
  event: EventBus;
  authSessions: AuthSessionService;
  signingKeys: AuthSigningKeyRing;
  models: Models;
  userId: string;
  userSessionId: string;
}>;

test.before(async t => {
  const app = await createTestingApp({ imports: [AuthModule] });
  t.context.app = app;
  t.context.auth = app.get(AuthService);
  t.context.cache = app.get(Cache);
  t.context.config = app.get(ConfigFactory);
  t.context.db = app.get(PrismaClient);
  t.context.event = app.get(EventBus);
  t.context.authSessions = app.get(AuthSessionService);
  t.context.signingKeys = app.get(AuthSigningKeyRing);
  t.context.models = app.get(Models);
});

test.beforeEach(async t => {
  await t.context.app.initTestingDB();
  t.context.config.override({
    auth: {
      token: {
        accessTokenTtl: 900,
        refreshIdleTtl: 30 * 24 * 60 * 60,
        refreshAbsoluteTtl: 180 * 24 * 60 * 60,
        refreshGracePeriod: 30,
        refreshRetention: 30 * 24 * 60 * 60,
      },
    },
  });
  const user = await t.context.auth.signUp('auth-session@affine.pro', '1');
  const userSession = await t.context.auth.createUserSession(user.id);
  t.context.userId = user.id;
  t.context.userSessionId = userSession.id;
});

test.after.always(async t => {
  await t.context.app.close();
});

test.serial('stores only a hash of the refresh token', async t => {
  const issued = await t.context.authSessions.create({
    userSessionId: t.context.userSessionId,
    installationId: 'installation-1',
    platform: 'ios',
  });
  const persisted = await t.context.db.authRefreshToken.findFirstOrThrow();

  t.regex(issued.refreshToken, /^aff_rt_v1\.[^.]+\.[^.]+$/);
  t.not(persisted.secretHash, issued.refreshToken);
  t.false(issued.refreshToken.includes(persisted.secretHash));
  const secret = issued.refreshToken.split('.')[2];
  t.is(
    persisted.secretHash,
    createHash('sha256').update(Buffer.from(secret, 'base64url')).digest('hex')
  );
});

test.serial('emits token-free security policy events', async t => {
  const events: Events['auth.security.detected'][] = [];
  const dispose = t.context.event.on('auth.security.detected', event => {
    events.push(event);
  });

  const issued = await t.context.authSessions.create({
    userSessionId: t.context.userSessionId,
    installationId: 'installation-security',
    platform: 'ios',
  });
  await t.context.authSessions.revokeUserSessions(
    t.context.userId,
    'security_action'
  );
  await new Promise(resolve => setImmediate(resolve));
  dispose();

  t.deepEqual(
    events.map(event => event.type),
    ['new_device_login', 'sessions_revoked']
  );
  t.false(JSON.stringify(events).includes(issued.refreshToken));
});

test.serial('emits new-device policy only for a new installation', async t => {
  const events: Events['auth.security.detected'][] = [];
  const dispose = t.context.event.on('auth.security.detected', event => {
    if (event.type === 'new_device_login') events.push(event);
  });
  const input = {
    userSessionId: t.context.userSessionId,
    installationId: 'same-installation',
    platform: 'ios',
  };

  await t.context.authSessions.create(input);
  const secondParent = await t.context.auth.createUserSession(t.context.userId);
  await t.context.authSessions.create({
    ...input,
    userSessionId: secondParent.id,
  });
  await new Promise(resolve => setImmediate(resolve));
  dispose();

  t.is(events.length, 1);
});

test.serial(
  'emits one new-device event for concurrent session creation',
  async t => {
    const events: Events['auth.security.detected'][] = [];
    const dispose = t.context.event.on('auth.security.detected', event => {
      if (event.type === 'new_device_login') events.push(event);
    });
    const secondParent = await t.context.auth.createUserSession(
      t.context.userId
    );

    await Promise.all([
      t.context.authSessions.create({
        userSessionId: t.context.userSessionId,
        installationId: 'concurrent-installation',
        platform: 'ios',
      }),
      t.context.authSessions.create({
        userSessionId: secondParent.id,
        installationId: 'concurrent-installation',
        platform: 'ios',
      }),
    ]);
    await new Promise(resolve => setImmediate(resolve));
    dispose();

    t.is(events.length, 1);
  }
);

test.serial(
  'revokes auth sessions before user deletion or disable',
  async t => {
    await t.context.authSessions.create({
      userSessionId: t.context.userSessionId,
      installationId: 'deleted-user-device',
      platform: 'android',
    });
    const detected = t.context.event.waitFor('auth.security.detected', 1000);

    await t.context.models.user.delete(t.context.userId);
    const [event] = (await detected) as [Events['auth.security.detected']];

    t.is(event.type, 'sessions_revoked');
    t.is(event.reason, 'user_deleted_or_disabled');
    t.is(
      await t.context.db.authSession.count({
        where: { userSession: { userId: t.context.userId } },
      }),
      0
    );
  }
);

test.serial('rotates refresh tokens and revokes reuse after grace', async t => {
  const issued = await t.context.authSessions.create({
    userSessionId: t.context.userSessionId,
    installationId: 'installation-1',
    platform: 'android',
  });

  const concurrent = await Promise.all([
    t.context.authSessions.refresh(issued.refreshToken, '0.27.0'),
    t.context.authSessions.refresh(issued.refreshToken, '0.27.0'),
  ]);
  t.deepEqual(
    concurrent.map(result => result.status),
    ['rotated', 'rotated']
  );
  if (
    concurrent[0].status !== 'rotated' ||
    concurrent[1].status !== 'rotated'
  ) {
    return;
  }
  t.is(concurrent[0].refreshToken, concurrent[1].refreshToken);
  const next = await t.context.authSessions.refresh(
    concurrent[0].refreshToken,
    '0.27.0'
  );
  t.is(next.status, 'rotated');

  const replay = await t.context.authSessions.refresh(issued.refreshToken);
  t.is(replay.status, 'reused');
  if (replay.status === 'reused') {
    t.is(replay.code, 'REFRESH_TOKEN_REUSED');
  }

  const session = await t.context.db.authSession.findUniqueOrThrow({
    where: { id: issued.session.id },
  });
  t.truthy(session.revokedAt);
  t.is(session.revokeReason, 'refresh_token_reused');
});

test.serial('bounds a refresh-token concurrency storm', async t => {
  const issued = await t.context.authSessions.create({
    userSessionId: t.context.userSessionId,
    installationId: 'installation-1',
    platform: 'android',
  });

  const results = await Promise.all(
    Array.from({ length: 100 }, () =>
      t.context.authSessions.refresh(issued.refreshToken, '0.27.0')
    )
  );
  const rotated = results.filter(result => result.status === 'rotated');
  t.is(rotated.length, 2);
  if (rotated.length !== 2) return;
  t.is(rotated[0].refreshToken, rotated[1].refreshToken);
  t.true(
    results.some(
      result => result.status === 'reused' || result.status === 'revoked'
    )
  );

  const session = await t.context.db.authSession.findUniqueOrThrow({
    where: { id: issued.session.id },
  });
  t.is(session.revokeReason, 'refresh_token_reused');
});

test.serial(
  'does not return an unpersisted token when the grace cache is lost',
  async t => {
    const issued = await t.context.authSessions.create({
      userSessionId: t.context.userSessionId,
      installationId: 'installation-1',
      platform: 'ios',
    });
    const sourceTokenId = issued.refreshToken.split('.')[1];
    const rotated = await t.context.authSessions.refresh(issued.refreshToken);
    t.is(rotated.status, 'rotated');
    if (rotated.status !== 'rotated') return;

    await t.context.cache.delete(`auth:session-refresh:${sourceTokenId}`);
    const retry = await t.context.authSessions.refresh(issued.refreshToken);
    t.deepEqual(retry, {
      status: 'temporarily_unavailable',
      code: 'AUTH_SESSION_TEMPORARILY_UNAVAILABLE',
    });

    t.is(
      (await t.context.authSessions.refresh(rotated.refreshToken)).status,
      'rotated'
    );
  }
);

test.serial('rejects expired and revoked auth sessions', async t => {
  const issued = await t.context.authSessions.create({
    userSessionId: t.context.userSessionId,
    installationId: 'installation-1',
    platform: 'electron',
  });
  await t.context.db.authSession.update({
    where: { id: issued.session.id },
    data: { idleExpiresAt: new Date(Date.now() - 1000) },
  });

  const expired = await t.context.authSessions.refresh(issued.refreshToken);
  t.is(expired.status, 'expired');
  if (expired.status === 'expired') {
    t.is(expired.code, 'AUTH_SESSION_EXPIRED');
  }

  await t.context.authSessions.revoke(issued.session.id, 'user_action');
  const revoked = await t.context.authSessions.refresh(issued.refreshToken);
  t.is(revoked.status, 'revoked');
  if (revoked.status === 'revoked') {
    t.is(revoked.code, 'AUTH_SESSION_REVOKED');
  }
});

test.serial('revokes refresh for a disabled user', async t => {
  const issued = await t.context.authSessions.create({
    userSessionId: t.context.userSessionId,
    installationId: 'installation-disabled',
    platform: 'ios',
  });
  await t.context.db.user.update({
    where: { id: t.context.userId },
    data: { disabled: true },
  });

  const result = await t.context.authSessions.refresh(issued.refreshToken);
  t.deepEqual(result, {
    status: 'revoked',
    code: 'AUTH_SESSION_REVOKED',
  });
  const session = await t.context.db.authSession.findUniqueOrThrow({
    where: { id: issued.session.id },
  });
  t.is(session.revokeReason, 'user_disabled');
});

for (const expiry of [
  'absolute session',
  'refresh token',
  'parent user session',
] as const) {
  test.serial(`rejects ${expiry} expiry`, async t => {
    const issued = await t.context.authSessions.create({
      userSessionId: t.context.userSessionId,
      installationId: 'installation-1',
      platform: 'electron',
    });
    const expiredAt = new Date(Date.now() - 1000);
    if (expiry === 'absolute session') {
      await t.context.db.authSession.update({
        where: { id: issued.session.id },
        data: { absoluteExpiresAt: expiredAt },
      });
    } else if (expiry === 'refresh token') {
      await t.context.db.authRefreshToken.updateMany({
        where: { authSessionId: issued.session.id },
        data: { expiresAt: expiredAt },
      });
    } else {
      await t.context.db.userSession.update({
        where: { id: t.context.userSessionId },
        data: { expiresAt: expiredAt },
      });
    }

    const result = await t.context.authSessions.refresh(issued.refreshToken);
    t.deepEqual(result, {
      status: 'expired',
      code: 'AUTH_SESSION_EXPIRED',
    });
  });
}

test.serial(
  'returns a stable code for malformed refresh credentials',
  async t => {
    const result = await t.context.authSessions.refresh('invalid');
    t.deepEqual(result, {
      status: 'invalid',
      code: 'REFRESH_TOKEN_INVALID',
    });
  }
);

test.serial(
  'deleting the user session cascades to auth-session credentials',
  async t => {
    const issued = await t.context.authSessions.create({
      userSessionId: t.context.userSessionId,
      installationId: 'installation-1',
      platform: 'ios',
    });

    await t.context.db.userSession.delete({
      where: { id: t.context.userSessionId },
    });

    t.is(
      await t.context.db.authSession.findUnique({
        where: { id: issued.session.id },
      }),
      null
    );
    t.is(await t.context.db.authRefreshToken.count(), 0);
  }
);

test.serial('cleans auth sessions after the retention window', async t => {
  const issued = await t.context.authSessions.create({
    userSessionId: t.context.userSessionId,
    installationId: 'installation-1',
    platform: 'ios',
  });
  await t.context.db.authSession.update({
    where: { id: issued.session.id },
    data: {
      absoluteExpiresAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    },
  });

  t.is(await t.context.authSessions.cleanup(), 1);
  t.is(await t.context.db.authSession.count(), 0);
  t.is(await t.context.db.authRefreshToken.count(), 0);
});

test.serial('rolls back a failed refresh generation insert', async t => {
  const issued = await t.context.authSessions.create({
    userSessionId: t.context.userSessionId,
    installationId: 'installation-1',
    platform: 'ios',
  });
  const current = await t.context.db.authRefreshToken.findFirstOrThrow({
    where: { authSessionId: issued.session.id },
  });

  await t.throwsAsync(() =>
    t.context.models.authSession.rotate({
      id: current.id,
      secretHash: current.secretHash,
      now: new Date(),
      idleExpiresAt: new Date(Date.now() + 60_000),
      graceMs: 30_000,
      next: {
        id: current.id,
        secretHash: current.secretHash,
        expiresAt: new Date(Date.now() + 60_000),
      },
    })
  );

  const after = await t.context.db.authRefreshToken.findUniqueOrThrow({
    where: { id: current.id },
  });
  t.is(after.usedAt, null);
  t.is(after.replacedById, null);
});

test.serial(
  'selects one active signing key and keeps retiring keys readable',
  async t => {
    const retiredAt = new Date();
    const verifyUntil = new Date(retiredAt.getTime() + (900 + 30) * 1000);
    await setSigningKeys(t.context.db, [
      {
        id: 'active',
        secret: Buffer.alloc(32, 1).toString('base64url'),
        status: 'active',
        source: 'auto',
      },
      {
        id: 'retiring',
        secret: Buffer.alloc(32, 2).toString('base64url'),
        status: 'retiring',
        source: 'admin',
        retiredAt: retiredAt.toISOString(),
        verifyUntil: verifyUntil.toISOString(),
      },
    ]);
    await t.context.signingKeys.onSigningKeysChanged();

    t.is((await t.context.signingKeys.active()).id, 'active');
    t.is((await t.context.signingKeys.verify('retiring'))?.status, 'retiring');
    t.is(
      await t.context.signingKeys.verify(
        'retiring',
        new Date(verifyUntil.getTime() + 1)
      ),
      undefined
    );
    await setSigningKeys(t.context.db, [
      {
        id: 'active',
        secret: Buffer.alloc(32, 1).toString('base64url'),
        status: 'active',
        source: 'auto',
      },
    ]);
    await t.context.signingKeys.onSigningKeysChanged();
    t.is(await t.context.signingKeys.verify('retiring'), undefined);
    t.is(await t.context.signingKeys.verify('missing'), undefined);
  }
);

test.serial('rejects ambiguous signing key rings', async t => {
  await setSigningKeys(t.context.db, [
    {
      id: 'one',
      secret: Buffer.alloc(32, 1).toString('base64url'),
      status: 'active',
      source: 'auto',
    },
    {
      id: 'two',
      secret: Buffer.alloc(32, 2).toString('base64url'),
      status: 'active',
      source: 'admin',
    },
  ]);

  await t.throwsAsync(() => t.context.signingKeys.onSigningKeysChanged(), {
    message: 'Auth session requires exactly one active signing key.',
  });
});

test.serial(
  'rejects invalid signing key material and retirement data',
  async t => {
    const cases = [
      {
        name: 'short key',
        keys: [
          {
            id: 'short',
            secret: Buffer.alloc(8).toString('base64url'),
            status: 'active' as const,
            source: 'auto' as const,
          },
        ],
        message: /at least 32 bytes/,
      },
      {
        name: 'non-canonical key',
        keys: [
          {
            id: 'non-canonical',
            secret: `${Buffer.alloc(32).toString('base64url')}=`,
            status: 'active' as const,
            source: 'auto' as const,
          },
        ],
        message: /canonical base64url/,
      },
      {
        name: 'duplicate id',
        keys: [
          {
            id: 'duplicate',
            secret: Buffer.alloc(32, 1).toString('base64url'),
            status: 'active' as const,
            source: 'auto' as const,
          },
          {
            id: 'duplicate',
            secret: Buffer.alloc(32, 2).toString('base64url'),
            status: 'active' as const,
            source: 'admin' as const,
          },
        ],
        message: /ids must be unique/,
      },
      {
        name: 'retiring without deadline',
        keys: [
          {
            id: 'active',
            secret: Buffer.alloc(32, 1).toString('base64url'),
            status: 'active' as const,
            source: 'auto' as const,
          },
          {
            id: 'retiring',
            secret: Buffer.alloc(32, 2).toString('base64url'),
            status: 'retiring' as const,
            source: 'admin' as const,
          },
        ],
        message: /requires retiredAt and verifyUntil/,
      },
    ];

    for (const testCase of cases) {
      await setSigningKeys(t.context.db, testCase.keys);
      await t.throwsAsync(() => t.context.signingKeys.onSigningKeysChanged(), {
        message: testCase.message,
      });
    }
  }
);

test.serial('persists one stable database signing key', async t => {
  await t.context.db.appConfig.deleteMany({
    where: { id: 'auth.session.signingKeys' },
  });
  await t.context.signingKeys.onConfigInit();
  const first = (await t.context.signingKeys.active()).id;
  const stored = await t.context.db.appConfig.findUniqueOrThrow({
    where: { id: 'auth.session.signingKeys' },
  });
  t.is((stored.value as Array<{ id: string }>)[0]?.id, first);

  await t.context.signingKeys.onConfigInit();
  t.is((await t.context.signingKeys.active()).id, first);
});

test.serial('rotates and safely deletes signing keys', async t => {
  await t.context.signingKeys.onConfigInit();
  const previous = (await t.context.signingKeys.active()).id;

  const rotated = await t.context.signingKeys.rotate(
    t.context.userId,
    previous
  );
  const active = rotated.find(key => key.status === 'active');
  const retiring = rotated.find(key => key.id === previous);
  t.truthy(active);
  t.is(retiring?.status, 'retiring');
  t.truthy(await t.context.signingKeys.verify(previous));
  t.false(JSON.stringify(rotated).includes('secret'));
  await t.throwsAsync(t.context.signingKeys.rotate(t.context.userId, previous));
  await t.throwsAsync(t.context.signingKeys.delete(t.context.userId, previous));

  const stored = await t.context.db.appConfig.findUniqueOrThrow({
    where: { id: 'auth.session.signingKeys' },
  });
  const ring = stored.value as Array<Record<string, unknown>>;
  const verifyUntil = new Date(Date.now() - 1);
  const retiredAt = new Date(verifyUntil.getTime() - 931_000);
  await t.context.db.appConfig.update({
    where: { id: stored.id },
    data: {
      value: ring.map(key =>
        key.id === previous
          ? {
              ...key,
              retiredAt: retiredAt.toISOString(),
              verifyUntil: verifyUntil.toISOString(),
            }
          : key
      ) as Prisma.InputJsonValue,
    },
  });
  await t.context.signingKeys.onSigningKeysChanged();
  const afterDelete = await t.context.signingKeys.delete(
    t.context.userId,
    previous
  );
  t.false(afterDelete.some(key => key.id === previous));
  t.is(afterDelete.filter(key => key.status === 'active').length, 1);
});

async function setSigningKeys(db: PrismaClient, keys: unknown) {
  await db.appConfig.upsert({
    where: { id: 'auth.session.signingKeys' },
    update: { value: keys as Prisma.InputJsonValue },
    create: {
      id: 'auth.session.signingKeys',
      value: keys as Prisma.InputJsonValue,
    },
  });
}
