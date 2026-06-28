import { ScheduleModule } from '@nestjs/schedule';
import { TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import test from 'ava';
import Sinon from 'sinon';

import { AuthModule, AuthService } from '../../core/auth';
import { AuthCronJob } from '../../core/auth/job';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { createTestingModule } from '../utils';

let m: TestingModule;
let db: PrismaClient;
const runtime = {
  cleanupExpiredUserSessions: Sinon.stub(),
};

test.before(async () => {
  m = await createTestingModule({
    imports: [ScheduleModule.forRoot(), AuthModule],
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
  const auth = m.get(AuthService);
  const job = m.get(AuthCronJob);
  const user1 = await auth.signUp('u1@affine.pro', '1');
  const user2 = await auth.signUp('u2@affine.pro', '1');
  await auth.createUserSession(user1.id);
  await auth.createUserSession(user2.id);
  let userSessions = await db.userSession.findMany();
  t.is(userSessions.length, 2);

  runtime.cleanupExpiredUserSessions.reset();
  runtime.cleanupExpiredUserSessions.resolves(0);
  await job.cleanExpiredUserSessions();
  t.true(runtime.cleanupExpiredUserSessions.calledOnce);
  t.deepEqual(runtime.cleanupExpiredUserSessions.firstCall.args, [1000]);

  runtime.cleanupExpiredUserSessions.reset();
  runtime.cleanupExpiredUserSessions.onCall(0).resolves(1000);
  runtime.cleanupExpiredUserSessions.onCall(1).resolves(2);
  await job.cleanExpiredUserSessions();
  t.is(runtime.cleanupExpiredUserSessions.callCount, 2);
  t.deepEqual(runtime.cleanupExpiredUserSessions.firstCall.args, [1000]);
  t.deepEqual(runtime.cleanupExpiredUserSessions.secondCall.args, [1000]);
});
