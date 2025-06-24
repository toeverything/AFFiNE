import { indexerAggregateQuery, SearchTable } from '@affine/graphql';

import { IndexerService } from '../../../plugins/indexer/service';
import { Mockers } from '../../mocks';
import { app, e2e } from '../test';

e2e('should aggregate by docId', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  const indexerService = app.get(IndexerService);

  await indexerService.write(
    SearchTable.block,
    [
      {
        docId: 'doc-0',
        workspaceId: workspace.id,
        content: 'test1 hello world top2',
        flavour: 'affine:text',
        blockId: 'block-0',
        createdByUserId: owner.id,
        updatedByUserId: owner.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        docId: 'doc-0',
        workspaceId: workspace.id,
        content: 'test2 hello hello top3',
        flavour: 'affine:text',
        blockId: 'block-1',
        createdByUserId: owner.id,
        updatedByUserId: owner.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        docId: 'doc-0',
        workspaceId: workspace.id,
        content: 'test3 hello title top1',
        flavour: 'affine:page',
        blockId: 'block-2',
        createdByUserId: owner.id,
        updatedByUserId: owner.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        docId: 'doc-1',
        workspaceId: workspace.id,
        content: 'test4 hello world',
        flavour: 'affine:text',
        blockId: 'block-3',
        refDocId: 'doc-0',
        ref: ['{"foo": "bar1"}'],
        createdByUserId: owner.id,
        updatedByUserId: owner.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        docId: 'doc-2',
        workspaceId: workspace.id,
        content: 'test5 hello',
        flavour: 'affine:text',
        blockId: 'block-4',
        refDocId: 'doc-0',
        ref: ['{"foo": "bar2"}'],
        createdByUserId: owner.id,
        updatedByUserId: owner.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    {
      refresh: true,
    }
  );

  const result = await app.gql({
    query: indexerAggregateQuery,
    variables: {
      id: workspace.id,
      input: {
        table: SearchTable.block,
        query: {
          // @ts-expect-error allow to use string as enum
          type: 'boolean',
          // @ts-expect-error allow to use string as enum
          occur: 'must',
          queries: [
            {
              // @ts-expect-error allow to use string as enum
              type: 'match',
              field: 'content',
              match: 'hello world',
            },
            {
              // @ts-expect-error allow to use string as enum
              type: 'boolean',
              // @ts-expect-error allow to use string as enum
              occur: 'should',
              queries: [
                {
                  // @ts-expect-error allow to use string as enum
                  type: 'match',
                  field: 'content',
                  match: 'hello world',
                },
                {
                  // @ts-expect-error allow to use string as enum
                  type: 'boost',
                  boost: 1.5,
                  query: {
                    // @ts-expect-error allow to use string as enum
                    type: 'match',
                    field: 'flavour',
                    match: 'affine:page',
                  },
                },
              ],
            },
          ],
        },
        field: 'docId',
        options: {
          pagination: {
            limit: 50,
            skip: 0,
          },
          hits: {
            pagination: {
              limit: 2,
              skip: 0,
            },
            fields: ['blockId', 'flavour'],
            highlights: [
              {
                field: 'content',
                before: '<b>',
                end: '</b>',
              },
            ],
          },
        },
      },
    },
  });

  t.truthy(result.workspace.aggregate, 'failed to aggregate');
  t.is(result.workspace.aggregate.pagination.count, 5);
  t.is(result.workspace.aggregate.pagination.hasMore, true);
  t.truthy(result.workspace.aggregate.pagination.nextCursor);
  t.snapshot(result.workspace.aggregate.buckets);
});
