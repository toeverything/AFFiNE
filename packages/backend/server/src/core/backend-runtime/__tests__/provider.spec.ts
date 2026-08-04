import { generateKeyPairSync } from 'node:crypto';

import test from 'ava';
import Sinon from 'sinon';

import type { Config } from '../../../base';
import { BackendRuntimeProvider } from '../provider';

const privateKey = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
}).privateKey.export({ format: 'pem', type: 'pkcs8' }) as string;
const config = { crypto: { privateKey } } as Config;

test('backend-runtime provider starts once, runs migrations once, and reports health', async t => {
  const provider = new BackendRuntimeProvider(config);
  const runtime = {
    start: Sinon.stub().resolves(),
    stop: Sinon.stub().resolves(),
    runMigrations: Sinon.stub().resolves(),
    reloadConfig: Sinon.stub().resolves(),
    health: Sinon.stub().resolves({
      started: true,
      databaseConnected: true,
    }),
  };
  (provider as unknown as { runtime: typeof runtime }).runtime = runtime;

  await provider.start();
  await provider.start();
  await provider.onConfigChanged({ updates: { mailer: {} } });
  await provider.onConfigChanged({ updates: { copilot: {} } });
  const health = await provider.health();
  await provider.stop();

  t.is(runtime.start.callCount, 2);
  t.is(runtime.runMigrations.callCount, 1);
  t.true(runtime.reloadConfig.calledOnceWithExactly(privateKey));
  t.true(health.databaseConnected);
  t.is(runtime.stop.callCount, 1);
});

test('backend-runtime provider measures explicit typed methods', async t => {
  const provider = new BackendRuntimeProvider(config);
  const runtime = {
    cleanupExpiredRuntimeStates: Sinon.stub().resolves(3),
    assertCopilotRoute: Sinon.stub().resolves(),
  };
  (provider as unknown as { runtime: typeof runtime }).runtime = runtime;

  const result = await provider.cleanupExpiredRuntimeStates(1000);
  const routeInput = {
    slot: 'transcript.audio',
    access: {
      routeAllowed: true,
      managedTier: 'Standard' as const,
      serverByok: true,
      localByok: false,
    },
  };
  await provider.assertCopilotRoute(routeInput);

  t.is(result, 3);
  t.true(runtime.cleanupExpiredRuntimeStates.calledOnceWithExactly(1000));
  t.true(runtime.assertCopilotRoute.calledOnceWithExactly(routeInput));
});
