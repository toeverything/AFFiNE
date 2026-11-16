import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import test from 'ava';
import Sinon from 'sinon';

import { AccessDenied, type EventBus, NotFound } from '../../../base';
import { ServerConfigHandle } from '../../../native';
import { BackendRuntimeProvider } from '../provider';
import { WorkspaceLifecycleMigration } from '../workspace-lifecycle';

const privateKey = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
}).privateKey.export({ format: 'pem', type: 'pkcs8' }) as string;
const directory = mkdtempSync(join(tmpdir(), 'affine-backend-runtime-'));
const configPath = join(directory, 'config.json');
writeFileSync(
  configPath,
  JSON.stringify({
    deployment: { type: 'selfhosted' },
    crypto: { privateKey },
    copilot: { enabled: false },
  })
);
const serverConfig = new ServerConfigHandle(configPath);
test.after.always(() => rmSync(directory, { recursive: true, force: true }));

test.serial(
  'backend-runtime provider starts without migrations and exposes explicit migration',
  async t => {
    const event = {
      emitAsync: Sinon.stub().resolves(),
    };
    const provider = new BackendRuntimeProvider(
      serverConfig,
      event as unknown as EventBus
    );
    const runtime = {
      start: Sinon.stub().resolves(),
      stop: Sinon.stub().resolves(),
      runMigrations: Sinon.stub().resolves(),
      reloadConfig: Sinon.stub().resolves(),
      health: Sinon.stub().resolves({
        started: true,
        databaseConnected: true,
        invalidation: {
          state: 'disabled',
          reconnects: 0,
          decodeFailures: 0,
          received: 0,
          published: 0,
          publishFailures: 0,
        },
      }),
    };
    (provider as unknown as { runtime: typeof runtime }).runtime = runtime;
    const lifecycle = (
      provider as unknown as { workspaceLifecycle: WorkspaceLifecycleMigration }
    ).workspaceLifecycle;
    const startSweep = Sinon.stub(lifecycle, 'start');
    const runSweep = Sinon.stub(lifecycle, 'run').resolves();
    t.teardown(() => {
      startSweep.restore();
      runSweep.restore();
    });

    await provider.start();
    await provider.start();
    await provider.runMigrations();
    await provider.onConfigChanged({ updates: { mailer: {} } });
    await provider.onConfigChanged({ updates: { copilot: {} } });
    await provider.onConfigChanged({ updates: { storages: {} } });
    await provider.onConfigChanged({ updates: { oauth: {} } });
    const health = await provider.health();
    t.is(runtime.reloadConfig.callCount, 3);
    t.true(runtime.reloadConfig.alwaysCalledWithExactly());
    t.is(event.emitAsync.callCount, 5);
    t.true(
      event.emitAsync.calledWith('backendRuntime.configApplied', {
        updates: { copilot: {} },
      })
    );
    t.true(
      event.emitAsync.calledWith('backendRuntime.configApplied', {
        updates: { oauth: {} },
      })
    );

    runtime.reloadConfig.rejects(new Error('sensitive native credential'));
    await provider.onConfigChanged({ updates: { copilot: {} } });
    await provider.stop();

    t.is(startSweep.callCount, 2);
    const flavors = Sinon.stub(env, 'flavors').get(() => ({ script: true }));
    try {
      await provider.start();
      t.is(startSweep.callCount, 2);
      await provider.runWorkspaceLifecycleMigrationsV1();
      t.true(runSweep.calledOnce);
    } finally {
      flavors.restore();
      await provider.stop();
    }
    t.is(runtime.start.callCount, 3);
    t.is(runtime.runMigrations.callCount, 1);
    t.is(runtime.reloadConfig.callCount, 4);
    t.is(event.emitAsync.callCount, 6);
    t.true(health.databaseConnected);
    t.is(runtime.stop.callCount, 2);
  }
);

test('backend-runtime provider measures explicit typed methods', async t => {
  const provider = new BackendRuntimeProvider(serverConfig);
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

test('blob authorization and missing sources retain HTTP error statuses', async t => {
  const provider = new BackendRuntimeProvider(serverConfig);
  const runtime = {
    getDocBlobManifestV1: Sinon.stub(),
    getBlobV1: Sinon.stub(),
  };
  (provider as unknown as { runtime: typeof runtime }).runtime = runtime;
  const source = {
    type: 'currentDoc' as const,
    workspaceId: 'workspace',
    docId: 'doc',
  };
  for (const [code, errorClass, status] of [
    ['blob_source_access_denied', AccessDenied, 403],
    ['blob_source_not_found', NotFound, 404],
  ] as const) {
    runtime.getDocBlobManifestV1.rejects(
      new Error(`[affine-runtime:${code}] ${code}`)
    );
    runtime.getBlobV1.rejects(new Error(`[affine-runtime:${code}] ${code}`));
    for (const request of [
      () => provider.getDocBlobManifestV1(undefined, source),
      () => provider.openBlobV1(undefined, source, 'blob'),
    ]) {
      const error = await t.throwsAsync(request, { instanceOf: errorClass });
      t.is(error?.status, status);
    }
  }
});

test('backend-runtime provider encodes recursive search contracts at the native boundary', async t => {
  const provider = new BackendRuntimeProvider(serverConfig);
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
  const provider = new BackendRuntimeProvider(serverConfig);
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

test('workspace lifecycle sweep reports failures and continues beyond a failed page', async t => {
  const ids = Array.from(
    { length: 101 },
    (_, index) => `workspace-${String(index).padStart(3, '0')}`
  );
  const completed = new Set<string>();
  let failing = true;
  const attempted: string[] = [];
  let blocked: Promise<never> | undefined;
  const migration = new WorkspaceLifecycleMigration({
    async listWorkspaceLifecycleMigrationCandidatesV1(after) {
      return ids
        .filter(id => !completed.has(id) && (!after || id > after))
        .slice(0, 100);
    },
    async prepareWorkspaceLifecycleMigrationV1(id) {
      if (blocked) return blocked;
      attempted.push(id);
      if (id === ids[0] && failing) throw new Error('source unavailable');
      return { completed: false, revision: '1', rootStatus: 'missing' };
    },
    async migrateWorkspaceLifecycleV1(input) {
      completed.add(input.workspaceId);
      return true;
    },
  });
  await t.throwsAsync(() => migration.run(), { instanceOf: AggregateError });
  t.deepEqual(attempted, ids);
  t.is(completed.size, 100);
  failing = false;
  await migration.run();
  t.is(completed.size, 101);
  await migration.stop();

  const failure = Promise.withResolvers<never>();
  blocked = failure.promise;
  const foreground = migration.ensure('foreground');
  const rejected = t.throwsAsync(foreground, { message: 'foreground failed' });
  const provider = new BackendRuntimeProvider(serverConfig);
  const nativeStop = Sinon.stub().resolves();
  Object.assign(provider, {
    workspaceLifecycle: migration,
    runtime: { stop: nativeStop },
  });
  const stopping = provider.stop();
  await Promise.resolve();
  failure.reject(new Error('foreground failed'));
  await rejected;
  await stopping;
  t.true(nativeStop.calledOnce);
});
