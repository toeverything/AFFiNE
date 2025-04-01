import { randomUUID } from 'node:crypto';

import {
  indexerSearchQuery,
  SearchQueryOccur,
  SearchQueryType,
  SearchTable,
} from '@affine/graphql';

import { IndexerService } from '../../../plugins/indexer/service';
import { Mockers } from '../../mocks';
import { app, e2e } from '../test';

e2e('should search with query', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  const docIds = [randomUUID(), randomUUID(), randomUUID()];
  const indexerService = app.get(IndexerService);

  await indexerService.write(
    SearchTable.block,
    [
      {
        docId: docIds[0],
        workspaceId: workspace.id,
        content: 'test1',
        flavour: 'markdown',
        blockId: randomUUID(),
        createdByUserId: owner.id,
        updatedByUserId: owner.id,
        createdAt: new Date('2025-04-22T00:00:00.000Z'),
        updatedAt: new Date('2025-04-22T00:00:00.000Z'),
      },
      {
        docId: docIds[1],
        workspaceId: workspace.id,
        content: 'test2',
        flavour: 'markdown',
        blockId: randomUUID(),
        refDocId: [docIds[0]],
        ref: ['{"foo": "bar1"}'],
        createdByUserId: owner.id,
        updatedByUserId: owner.id,
        createdAt: new Date('2021-04-22T00:00:00.000Z'),
        updatedAt: new Date('2021-04-22T00:00:00.000Z'),
      },
      {
        docId: docIds[2],
        workspaceId: workspace.id,
        content: 'test3',
        flavour: 'markdown',
        blockId: randomUUID(),
        refDocId: [docIds[0], docIds[2]],
        ref: ['{"foo": "bar1"}', '{"foo": "bar3"}'],
        createdByUserId: owner.id,
        updatedByUserId: owner.id,
        createdAt: new Date('2025-03-22T00:00:00.000Z'),
        updatedAt: new Date('2025-03-22T00:00:00.000Z'),
      },
    ],
    {
      refresh: true,
    }
  );

  const result = await app.gql({
    query: indexerSearchQuery,
    variables: {
      id: workspace.id,
      input: {
        table: SearchTable.block,
        query: {
          type: SearchQueryType.boolean,
          occur: SearchQueryOccur.must,
          queries: [
            {
              type: SearchQueryType.boolean,
              occur: SearchQueryOccur.should,
              queries: docIds.map(id => ({
                type: SearchQueryType.match,
                field: 'docId',
                match: id,
              })),
            },
            {
              type: SearchQueryType.exists,
              field: 'refDocId',
            },
          ],
        },
        options: {
          fields: ['refDocId', 'ref'],
          pagination: {
            limit: 100,
          },
        },
      },
    },
  });
  // console.log(JSON.stringify(result, null, 2));
  t.truthy(result.workspace.search, 'failed to search');
  t.is(result.workspace.search.pagination.count, 2);
  t.is(result.workspace.search.pagination.hasMore, true);
  t.truthy(result.workspace.search.pagination.nextCursor);
  t.is(result.workspace.search.nodes.length, 2);
  t.deepEqual(result.workspace.search.nodes, [
    {
      fields: {
        refDocId: [docIds[0], docIds[2]],
        ref: ['{"foo": "bar1"}', '{"foo": "bar3"}'],
      },
      highlights: null,
    },
    {
      fields: {
        refDocId: [docIds[0]],
        ref: ['{"foo": "bar1"}'],
      },
      highlights: null,
    },
  ]);
});
