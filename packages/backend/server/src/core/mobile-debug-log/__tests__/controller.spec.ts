import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import {
  createTestingApp,
  type TestingApp,
  type TestUser,
} from '../../../__tests__/utils';
import { Config } from '../../../base';
import { MobileDebugLogService } from '../service';

interface Context {
  app: TestingApp;
  user: TestUser;
}

const test = ava.serial as TestFn<Context>;

test.before(async t => {
  const app = await createTestingApp();
  t.context.app = app;
  t.context.user = await app.signupV1();
});

test.after.always(async t => {
  await t.context.app.close();
});

test('should reject unauthenticated collect requests with 401 and log nothing', async t => {
  const { app } = t.context;

  app.clearAuth();
  await app
    .POST('/api/mobile-debug-log/collect')
    .send({ clientId: 'unauth-probe', entries: [{ message: 'nope' }] })
    .expect(401);

  // restore session for subsequent tests in this file
  await app.login(t.context.user);
  t.pass();
});

test('should reject with 403 when mobileDebugLog is disabled by default and log nothing', async t => {
  const { app } = t.context;

  t.is(app.get(Config).mobileDebugLog.enabled, false);

  await app
    .POST('/api/mobile-debug-log/collect')
    .send({ clientId: 'disabled-probe', entries: [{ message: 'nope' }] })
    .expect(403);
});

test('should accept an authenticated request once enabled and log a MobileDebugLog line containing the client id', async t => {
  const { app } = t.context;
  const config = app.get(Config);
  config.mobileDebugLog.enabled = true;

  const service = app.get(MobileDebugLogService) as any;
  const logSpy = Sinon.spy(service.logger, 'log');

  try {
    const clientId = '11111111-1111-1111-1111-111111111111';
    const res = await app
      .POST('/api/mobile-debug-log/collect')
      .send({ clientId, entries: [{ message: 'hello from client' }] })
      .expect(201);

    t.deepEqual(res.body, { ok: true, accepted: 1, dropped: 0 });
    t.true(logSpy.getCalls().some(call => call.args[0]?.includes(clientId)));
  } finally {
    logSpy.restore();
    config.mobileDebugLog.enabled = false;
  }
});

test('should truncate an oversized message rather than reject or log it raw', async t => {
  const { app } = t.context;
  const config = app.get(Config);
  config.mobileDebugLog.enabled = true;

  const service = app.get(MobileDebugLogService) as any;
  const logSpy = Sinon.spy(service.logger, 'log');

  try {
    const oversized = 'x'.repeat(5000);
    const res = await app
      .POST('/api/mobile-debug-log/collect')
      .send({
        clientId: 'oversized-probe',
        entries: [{ message: oversized }],
      })
      .expect(201);

    t.deepEqual(res.body, { ok: true, accepted: 1, dropped: 0 });
    const loggedCall = logSpy
      .getCalls()
      .find(call => call.args[0]?.includes('oversized-probe'));
    t.truthy(loggedCall);
    t.true(loggedCall!.args[0].includes('...[truncated]'));
    t.false(loggedCall!.args[0].includes(oversized));
  } finally {
    logSpy.restore();
    config.mobileDebugLog.enabled = false;
  }
});
