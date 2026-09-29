import { ScheduleModule } from '@nestjs/schedule';
import { TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import test from 'ava';
import Sinon from 'sinon';

import { AuthWorkerModule } from '../../core/auth';
import { AuthCronJob } from '../../core/auth/job';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { Models } from '../../models';
import { createTestingModule } from '../utils';

let m: TestingModule;
let db: PrismaClient;
const runtime = {
  cleanupExpiredUserSessions: Sinon.stub(),
  executeAuthSessionCommandV1: Sinon.stub(),
};

test.before(async () => {
  m = await createTestingModule({
    imports: [ScheduleModule.forRoot(), AuthWorkerModule],
    tapModule: builder => {
      builder.overrideProvider(BackendRuntimeProvider).useValue(runtime);
    },
  });

  db = m.get(PrismaClient);
});

test.after.always(async () => {
  await m.close();
});

test('should clean expired user sessions', async t => {
  const job = m.get(AuthCronJob);
  const models = m.get(Models);
  const user1 = await models.user.create({ email: 'u1@affine.pro' });
  const user2 = await models.user.create({ email: 'u2@affine.pro' });
  const session1 = await db.session.create({ data: {} });
  const session2 = await db.session.create({ data: {} });
  await db.userSession.createMany({
    data: [
      { sessionId: session1.id, userId: user1.id },
      { sessionId: session2.id, userId: user2.id },
    ],
  });
  let userSessions = await db.userSession.findMany();
  t.is(userSessions.length, 2);

  runtime.cleanupExpiredUserSessions.reset();
  runtime.executeAuthSessionCommandV1.reset();
  runtime.cleanupExpiredUserSessions.resolves(0);
  runtime.executeAuthSessionCommandV1.resolves(0);
  await job.cleanExpiredUserSessions();
  t.true(runtime.cleanupExpiredUserSessions.calledOnce);
  t.deepEqual(runtime.cleanupExpiredUserSessions.firstCall.args, [1000]);
  t.deepEqual(runtime.executeAuthSessionCommandV1.lastCall.args, [
    { action: 'cleanup', limit: 1000 },
  ]);

  runtime.cleanupExpiredUserSessions.reset();
  runtime.cleanupExpiredUserSessions.onCall(0).resolves(1000);
  runtime.cleanupExpiredUserSessions.onCall(1).resolves(2);
  await job.cleanExpiredUserSessions();
  t.is(runtime.cleanupExpiredUserSessions.callCount, 2);
  t.deepEqual(runtime.cleanupExpiredUserSessions.firstCall.args, [1000]);
  t.deepEqual(runtime.cleanupExpiredUserSessions.secondCall.args, [1000]);
});
