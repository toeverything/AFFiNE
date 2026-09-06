import {
  indexerAggregateQuery,
  SearchQueryType,
  SearchTable,
} from '@affine/graphql';

import { Config } from '../../../base';
import { BackendRuntimeProvider } from '../../../core/backend-runtime';
import { createDocWithMarkdown } from '../../../native';
import { Mockers } from '../../mocks';
import { app, e2e } from '../test';

const indexerE2e = app.get(Config).indexer.enabled ? e2e : e2e.skip;

indexerE2e('should aggregate by docId', async t => {
  const owner = await app.signup();
  const workspace = await app.create(Mockers.Workspace, {
    owner,
    snapshot: true,
  });
  for (const [docId, markdown] of [
    ['doc-0', 'hello world\n\nhello again'],
    ['doc-1', 'hello world'],
  ] as const) {
    await app.create(Mockers.DocMeta, { workspaceId: workspace.id, docId });
    await app.create(Mockers.DocSnapshot, {
      workspaceId: workspace.id,
      docId,
      user: owner,
      blob: createDocWithMarkdown(docId, markdown, docId),
    });
    await app.get(BackendRuntimeProvider).reconcileSearchProjection(1000);
  }

  const result = await app.gql({
    query: indexerAggregateQuery,
    variables: {
      id: workspace.id,
      input: {
        table: SearchTable.block,
        query: {
          type: SearchQueryType.match,
          field: 'content',
          match: 'hello',
        },
        field: 'docId',
        options: {
          pagination: { limit: 50, skip: 0 },
          hits: {
            pagination: { limit: 2, skip: 0 },
            fields: ['docId', 'blockId', 'content'],
          },
        },
      },
    },
  });

  t.is(result.workspace.aggregate.pagination.count, 2);
  t.deepEqual(
    result.workspace.aggregate.buckets.map(bucket => bucket.key).sort(),
    ['doc-0', 'doc-1']
  );
});
