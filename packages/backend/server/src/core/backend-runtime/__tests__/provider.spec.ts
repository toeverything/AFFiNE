import { generateKeyPairSync } from 'node:crypto';

import test from 'ava';
import Sinon from 'sinon';

import type { Config } from '../../../base';
import { BackendRuntimeProvider } from '../provider';

const privateKey = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
}).privateKey.export({ format: 'pem', type: 'pkcs8' }) as string;
const config = { crypto: { privateKey } } as Config;

test('backend-runtime provider starts without migrations and exposes explicit migration', async t => {
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
  await provider.runMigrations();
  await provider.onConfigChanged({ updates: { mailer: {} } });
  await provider.onConfigChanged({ updates: { copilot: {} } });
  await provider.onConfigChanged({ updates: { storages: {} } });
  const health = await provider.health();
  await provider.stop();

  t.is(runtime.start.callCount, 2);
  t.is(runtime.runMigrations.callCount, 1);
  t.is(runtime.reloadConfig.callCount, 2);
  t.true(runtime.reloadConfig.alwaysCalledWithExactly(privateKey));
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

test('backend-runtime provider encodes recursive search contracts at the native boundary', async t => {
  const provider = new BackendRuntimeProvider(config);
  const runtime = {
    searchAuthorized: Sinon.stub().resolves({
      ok: true,
      value: { total: 0, nodes: [] },
    }),
    aggregateAuthorized: Sinon.stub().resolves({
      ok: true,
      value: { total: 0, buckets: [] },
    }),
  };
  (provider as unknown as { runtime: typeof runtime }).runtime = runtime;
  const query = {
    type: 'boolean',
    occur: 'must',
    queries: [
      { type: 'exists', field: 'refDocId' },
      {
        type: 'boost',
        boost: 1.5,
        query: { type: 'match', field: 'content', match: 'hello' },
      },
    ],
  };

  await provider.searchAuthorized('actor', 'workspace', {
    table: 'block',
    query,
    options: {
      fields: ['docId'],
      highlights: [{ field: 'content', before: '<b>', end: '</b>' }],
      pagination: { limit: 10, cursor: 'cursor' },
    },
  });
  await provider.aggregateAuthorized('actor', 'workspace', {
    table: 'block',
    query,
    field: 'docId',
    options: {
      hits: { fields: ['content'] },
      pagination: { limit: 5, skip: 2 },
    },
  });

  const search = runtime.searchAuthorized.firstCall.args[2];
  t.is(search.rootQuery, 0);
  t.deepEqual(search.queries, [
    {
      queryType: 'boolean',
      field: undefined,
      matchValue: undefined,
      query: undefined,
      queries: [1, 2],
      occur: 'must',
      boost: undefined,
    },
    {
      queryType: 'exists',
      field: 'refDocId',
      matchValue: undefined,
      query: undefined,
      queries: undefined,
      occur: undefined,
      boost: undefined,
    },
    {
      queryType: 'boost',
      field: undefined,
      matchValue: undefined,
      query: 3,
      queries: undefined,
      occur: undefined,
      boost: 1.5,
    },
    {
      queryType: 'match',
      field: 'content',
      matchValue: 'hello',
      query: undefined,
      queries: undefined,
      occur: undefined,
      boost: undefined,
    },
  ]);
  t.deepEqual(search.options, {
    fields: ['docId'],
    highlights: [{ field: 'content', before: '<b>', end: '</b>' }],
    pagination: { limit: 10, cursor: 'cursor' },
  });
  t.deepEqual(runtime.aggregateAuthorized.firstCall.args[2].options, {
    hits: { fields: ['content'], highlights: [], pagination: {} },
    pagination: { limit: 5, skip: 2 },
  });
  t.true(runtime.searchAuthorized.calledOnce);
  t.true(runtime.searchAuthorized.calledWithMatch('actor', 'workspace'));
  t.true(runtime.aggregateAuthorized.calledOnce);
  t.true(runtime.aggregateAuthorized.calledWithMatch('actor', 'workspace'));
});

test('backend-runtime provider aborts a stream handle that resolves after iterator cancellation', async t => {
  const provider = new BackendRuntimeProvider(config);
  const abort = Sinon.stub();
  let resolveHandle!: (handle: { abort: () => void }) => void;
  const runtime = {
    executeCopilotStream: Sinon.stub().returns(
      new Promise<{ abort: () => void }>(resolve => {
        resolveHandle = resolve;
      })
    ),
  };
  (provider as unknown as { runtime: typeof runtime }).runtime = runtime;

  const stream = provider.streamCopilot({} as never, async () => '', {
    maxSteps: 1,
  });
  await stream.return?.();
  resolveHandle({ abort });
  await Promise.resolve();

  t.true(abort.calledOnce);
});
