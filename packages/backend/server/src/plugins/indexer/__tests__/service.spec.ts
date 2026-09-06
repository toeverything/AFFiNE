import test from 'ava';
import Sinon from 'sinon';

import {
  InternalServerError,
  InvalidIndexerInput,
  SearchIndexFailed,
  SearchIndexNotReady,
  SearchPermissionSyncing,
  SearchProviderUnavailable,
  SpaceAccessDenied,
} from '../../../base';
import { ConfigFactory } from '../../../base/config';
import { BackendRuntimeProvider } from '../../../core/backend-runtime';
import { BackendRuntimeSearchJob } from '../../../core/backend-runtime/job';
import { ServerFeature, ServerService } from '../../../core/config';
import { Models } from '../../../models';
import { IndexerResolver } from '../resolver';
import { IndexerService } from '../service';
import { SearchQueryType, SearchTable } from '../types';

test.afterEach.always(() => {
  Sinon.restore();
});

function enabledServer() {
  return {
    getConfig: Sinon.stub().returns({ indexer: { enabled: true } }),
    enableFeature: Sinon.stub(),
    disableFeature: Sinon.stub(),
  };
}

test('exposes the indexer capability while its projection is building', async t => {
  const runtime = {
    searchStatus: Sinon.stub(),
    searchAuthorized: Sinon.stub().resolves({
      ok: true,
      value: { total: 0, nodes: [] },
    }),
  };
  const server = enabledServer();
  const service = new IndexerService(
    runtime as unknown as BackendRuntimeProvider,
    {} as Models,
    server as unknown as ServerService
  );

  await service.onApplicationBootstrap();
  await service.onConfigChanged({ updates: { indexer: {} } } as never);
  await service.search('actor', 'workspace', {} as never);

  t.is(server.enableFeature.callCount, 3);
  t.false(server.disableFeature.called);
  t.false(runtime.searchStatus.called);
});

test('does not query native search when the indexer is disabled', async t => {
  const runtime = {
    searchStatus: Sinon.stub(),
  };
  const server = {
    getConfig: Sinon.stub().returns({ indexer: { enabled: false } }),
    enableFeature: Sinon.stub(),
    disableFeature: Sinon.stub(),
  };
  const service = new IndexerService(
    runtime as unknown as BackendRuntimeProvider,
    {} as Models,
    server as unknown as ServerService
  );

  await service.onApplicationBootstrap();

  t.false(runtime.searchStatus.called);
  t.true(server.disableFeature.calledOnceWith(ServerFeature.Indexer));
});

test('does not schedule or run native search reconciliation when disabled', async t => {
  const runtime = {
    reconcileSearchProjection: Sinon.stub(),
    searchStatus: Sinon.stub(),
  };
  const queue = { add: Sinon.stub() };
  const config = {
    config: { indexer: { enabled: false } },
  } as unknown as ConfigFactory;
  const job = new BackendRuntimeSearchJob(
    runtime as unknown as BackendRuntimeProvider,
    queue as never,
    config
  );

  await job.scheduleReconciliation();
  t.is(queue.add.callCount, 0);
  t.is(await job.reconcileProjection({ limit: 100 }), 0);
  t.false(runtime.reconcileSearchProjection.called);
  t.false(runtime.searchStatus.called);

  config.config.indexer.enabled = true;
  await job.scheduleReconciliation();
  t.deepEqual(queue.add.firstCall.args[2], {
    jobId: 'backend-runtime-search-reconciliation',
    attempts: 1,
    removeOnFail: true,
  });
});

test('maps native search results and typed errors at the Node boundary', async t => {
  const runtime = {
    searchStatus: Sinon.stub().resolves({ ready: true }),
    searchAuthorized: Sinon.stub(),
    aggregateAuthorized: Sinon.stub(),
  };
  const service = new IndexerService(
    runtime as unknown as BackendRuntimeProvider,
    {} as Models,
    enabledServer() as unknown as ServerService
  );
  const input = {
    table: SearchTable.block,
    query: { type: SearchQueryType.match, field: 'content', match: 'hello' },
    options: { fields: ['docId', 'createdAt'] },
  };
  runtime.searchAuthorized.resolves({
    ok: true,
    value: {
      total: 99,
      nodes: [
        {
          id: 'node',
          score: 1,
          fields: {
            workspace_id: ['workspace'],
            doc_id: ['doc'],
            created_at: [2_000],
          },
          highlights: { markdown_preview: ['<b>hello</b>'] },
        },
      ],
    },
  });

  const result = await service.search('actor', 'workspace', input);
  t.deepEqual(result.nodes[0]._source, {
    workspaceId: 'workspace',
    docId: 'doc',
  });
  t.true(result.nodes[0].fields.createdAt[0] instanceof Date);
  t.deepEqual(result.nodes[0].highlights, {
    markdownPreview: ['<b>hello</b>'],
  });

  const resolver = new IndexerResolver(service, {
    user: Sinon.stub().returns({
      workspace: Sinon.stub().returns({ assert: Sinon.stub().resolves() }),
    }),
  } as never);
  const searchResult = await resolver.search(
    { id: 'actor' } as never,
    { id: 'workspace' } as never,
    input
  );
  t.is(searchResult.pagination.count, 1);

  runtime.aggregateAuthorized.resolves({
    ok: true,
    value: {
      total: 99,
      hasMore: true,
      buckets: [{ key: 'doc', count: 1, hits: { nodes: [] } }],
    },
  });
  const aggregateResult = await resolver.aggregate(
    { id: 'actor' } as never,
    { id: 'workspace' } as never,
    {} as never
  );
  t.is(aggregateResult.pagination.count, 1);

  for (const [errorCode, expected] of [
    ['workspace_denied', SpaceAccessDenied],
    ['invalid_request', InvalidIndexerInput],
    ['unsupported_query', InvalidIndexerInput],
    ['provider_unavailable', SearchProviderUnavailable],
    ['index_not_ready', SearchIndexNotReady],
    ['permission_syncing', SearchPermissionSyncing],
    ['index_failed', SearchIndexFailed],
    ['unexpected', InternalServerError],
  ] as const) {
    runtime.searchAuthorized.resolves({ ok: false, errorCode });
    const error = await t.throwsAsync(
      service.search('actor', 'workspace', input)
    );
    t.true(error instanceof expected, errorCode);
  }
});

test('searchDocs keeps filtering and enrichment in Node', async t => {
  const blockNode = {
    id: 'block',
    score: 1,
    fields: {
      workspace_id: ['workspace'],
      doc_id: ['doc'],
      block_id: ['block'],
      unit_id: ['unit'],
      projection_version: [1],
      source_hash: ['hash'],
      visibility: ['visible'],
      source_block_id: ['source-block'],
      flavour: ['affine:paragraph'],
      content: ['body'],
      created_at: [2_000],
      updated_at: [3_000],
      created_by_user_id: ['creator'],
      updated_by_user_id: ['updater'],
    },
    highlights: { content: ['<b>body</b>'] },
  };
  const runtime = {
    searchStatus: Sinon.stub().resolves({ ready: true }),
    aggregateAuthorized: Sinon.stub().resolves({
      ok: true,
      value: {
        total: 1,
        hasMore: false,
        buckets: [
          {
            key: 'doc',
            count: 1,
            hits: {
              nodes: [blockNode],
            },
          },
        ],
      },
    }),
    searchAuthorized: Sinon.stub().resolves({
      ok: true,
      value: {
        total: 2,
        nodes: [blockNode, { ...blockNode, id: 'duplicate-block' }],
      },
    }),
  };
  const creator = { id: 'creator', name: 'Creator' };
  const updater = { id: 'updater', name: 'Updater' };
  const models = {
    doc: {
      findMetas: Sinon.stub().resolves([
        { docId: 'doc', title: 'Fallback title' },
      ]),
    },
    user: {
      getPublicUsersMap: Sinon.stub().resolves(
        new Map([
          ['creator', creator],
          ['updater', updater],
        ])
      ),
    },
  };
  const service = new IndexerService(
    runtime as unknown as BackendRuntimeProvider,
    models as unknown as Models,
    enabledServer() as unknown as ServerService
  );

  for (const limit of [0, -1]) {
    const error = await t.throwsAsync(
      service.searchDocsByKeyword('actor', 'workspace', 'body', { limit })
    );
    t.true(error instanceof InvalidIndexerInput);
  }
  t.false(runtime.aggregateAuthorized.called);
  t.deepEqual(
    await service.searchDocsByKeyword('actor', 'workspace', 'body', {
      docIds: [],
    }),
    []
  );
  t.false(runtime.aggregateAuthorized.called);
  const docs = await service.searchDocsByKeyword('actor', 'workspace', 'body', {
    limit: 5,
    docIds: ['doc'],
  });

  t.is(docs[0].docId, 'doc');
  t.is(docs[0].blockId, 'source-block');
  t.is(docs[0].title, 'Fallback title');
  t.is(docs[0].highlight, '<b>body</b>');
  t.deepEqual(docs[0].createdByUser, creator);
  t.deepEqual(docs[0].updatedByUser, updater);
  const request = runtime.aggregateAuthorized.firstCall.args[2];
  t.is(request.options.pagination?.limit, 5);
  t.true(JSON.stringify(request.query).includes('doc'));
  t.true(
    models.doc.findMetas.calledOnceWithExactly(
      [{ workspaceId: 'workspace', docId: 'doc' }],
      {
        select: { title: true },
      }
    )
  );

  runtime.aggregateAuthorized.resolves({
    ok: false,
    errorCode: 'unsupported_query',
  });
  const basicDocs = await service.searchDocsByKeyword(
    'actor',
    'workspace',
    'body',
    { limit: 5, docIds: ['doc'] }
  );
  t.is(basicDocs.length, 1);
  t.is(basicDocs[0].docId, 'doc');
  const basicRequest = runtime.searchAuthorized.firstCall.args[2];
  t.true(basicRequest.options.fields.includes('docId'));
  t.is(basicRequest.options.pagination?.limit, 20);
  t.true(JSON.stringify(basicRequest.query).includes('doc'));
  t.true(JSON.stringify(basicRequest.query).includes('workspace'));
});
