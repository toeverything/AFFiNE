import test from 'ava';
import Sinon from 'sinon';

import { BackendRuntimeProvider } from '../provider';

test('backend-runtime provider starts once, runs migrations once, and reports health', async t => {
  const provider = new BackendRuntimeProvider();
  const runtime = {
    start: Sinon.stub().resolves(),
    stop: Sinon.stub().resolves(),
    runMigrations: Sinon.stub().resolves(),
    health: Sinon.stub().resolves({
      started: true,
      databaseConnected: true,
    }),
  };
  (provider as any).runtime = runtime;

  await provider.start();
  await provider.start();
  const health = await provider.health();
  await provider.stop();

  t.is(runtime.start.callCount, 2);
  t.is(runtime.runMigrations.callCount, 1);
  t.true(health.databaseConnected);
  t.is(runtime.stop.callCount, 1);
});

test('backend-runtime provider measures explicit typed methods', async t => {
  const provider = new BackendRuntimeProvider();
  const runtime = {
    cleanupExpiredRuntimeStates: Sinon.stub().resolves(3),
  };
  (provider as any).runtime = runtime;

  const result = await provider.cleanupExpiredRuntimeStates(1000);

  t.is(result, 3);
  t.true(runtime.cleanupExpiredRuntimeStates.calledOnceWithExactly(1000));
});
