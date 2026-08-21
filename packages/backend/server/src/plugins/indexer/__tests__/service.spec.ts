import test from 'ava';
import Sinon from 'sinon';

import {
  InternalServerError,
  InvalidIndexerInput,
  SearchProviderNotFound,
  SpaceAccessDenied,
  WorkspacePermissionNotFound,
} from '../../../base';
import { BackendRuntimeProvider } from '../../../core/backend-runtime';
import { ServerService } from '../../../core/config';
import { Models } from '../../../models';
import { IndexerService } from '../service';
import { SearchQueryType, SearchTable } from '../types';

test.afterEach.always(() => {
  Sinon.restore();
});

test('reflects native search readiness in the Node feature flag', async t => {
  const runtime = {
    searchStatus: Sinon.stub(),
  };
  runtime.searchStatus.onFirstCall().resolves({ ready: true });
  runtime.searchStatus.onSecondCall().resolves({ ready: false });
  const server = {
    enableFeature: Sinon.stub(),
    disableFeature: Sinon.stub(),
  };
  const service = new IndexerService(
    runtime as unknown as BackendRuntimeProvider,
    {} as Models,
    server as unknown as ServerService
  );

  await service.onApplicationBootstrap();
  await service.onConfigChanged({ updates: { indexer: {} } } as never);

  t.true(server.enableFeature.calledOnce);
  t.true(server.disableFeature.calledOnce);
  t.is(runtime.searchStatus.callCount, 2);
});

test('maps native search results and typed errors at the Node boundary', async t => {
  const runtime = {
    searchAuthorized: Sinon.stub(),
  };
  const service = new IndexerService(
    runtime as unknown as BackendRuntimeProvider,
    {} as Models,
    {} as ServerService
  );
  const input = {
    table: SearchTable.block,
    query: { type: SearchQueryType.match, field: 'content', match: 'hello' },
    options: { fields: ['docId', 'createdAt'] },
  };
  runtime.searchAuthorized.resolves({
    ok: true,
    value: {
      total: 1,
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

  for (const [errorCode, expected] of [
    ['workspace_denied', SpaceAccessDenied],
    ['invalid_request', InvalidIndexerInput],
    ['unsupported_query', InvalidIndexerInput],
    ['provider_unavailable', SearchProviderNotFound],
    ['permission_unavailable', WorkspacePermissionNotFound],
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
  const runtime = {
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
              nodes: [
                {
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
                },
              ],
            },
          },
        ],
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
    {} as ServerService
  );

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
});
