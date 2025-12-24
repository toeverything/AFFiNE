import {
  indexerSearchQuery,
  SearchQueryOccur,
  SearchQueryType,
  SearchTable,
} from '@affine/graphql';

import { DocRole } from '../../../models';
import { IndexerService } from '../../../plugins/indexer/service';
import { Mockers } from '../../mocks';
import { app, e2e } from '../test';

e2e('should search with query', async t => {
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
        content: 'test1',
        flavour: 'markdown',
        blockId: 'block-0',
        createdByUserId: owner.id,
        updatedByUserId: owner.id,
        createdAt: new Date('2025-04-22T00:00:00.000Z'),
        updatedAt: new Date('2025-04-22T00:00:00.000Z'),
      },
      {
        docId: 'doc-1',
        workspaceId: workspace.id,
        content: 'test2',
        flavour: 'markdown',
        blockId: 'block-1',
        refDocId: ['doc-0'],
        ref: ['{"foo": "bar1"}'],
        createdByUserId: owner.id,
        updatedByUserId: owner.id,
        createdAt: new Date('2021-04-22T00:00:00.000Z'),
        updatedAt: new Date('2021-04-22T00:00:00.000Z'),
      },
      {
        docId: 'doc-2',
        workspaceId: workspace.id,
        content: 'test3',
        flavour: 'markdown',
        blockId: 'block-2',
        refDocId: ['doc-0', 'doc-2'],
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
              queries: ['doc-0', 'doc-1', 'doc-2'].map(id => ({
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

  t.truthy(result.workspace.search, 'failed to search');
  t.is(result.workspace.search.pagination.count, 2);
  t.is(result.workspace.search.pagination.hasMore, true);
  t.truthy(result.workspace.search.pagination.nextCursor);
  t.is(result.workspace.search.nodes.length, 2);
  t.snapshot(result.workspace.search.nodes);
});

e2e('should filter no read permission docs on team workspace', async t => {
  const owner = await app.signup();
  const workspace = await app.create(Mockers.Workspace, {
    owner,
  });
  await app.create(Mockers.TeamWorkspace, {
    id: workspace.id,
  });

  const indexerService = app.get(IndexerService);
  await indexerService.write(
    SearchTable.block,
    [
      {
        docId: 'doc-0',
        workspaceId: workspace.id,
        content: 'test1',
        flavour: 'markdown',
        blockId: 'block-0',
        createdByUserId: owner.id,
        updatedByUserId: owner.id,
        createdAt: new Date('2025-04-22T00:00:00.000Z'),
        updatedAt: new Date('2025-04-22T00:00:00.000Z'),
      },
      {
        docId: 'doc-1',
        workspaceId: workspace.id,
        content: 'test2',
        flavour: 'markdown',
        blockId: 'block-1',
        refDocId: ['doc-0'],
        ref: ['{"foo": "bar1"}'],
        createdByUserId: owner.id,
        updatedByUserId: owner.id,
        createdAt: new Date('2021-04-22T00:00:00.000Z'),
        updatedAt: new Date('2021-04-22T00:00:00.000Z'),
      },
      {
        docId: 'doc-2',
        workspaceId: workspace.id,
        content: 'test3',
        flavour: 'markdown',
        blockId: 'block-2',
        refDocId: ['doc-0', 'doc-2'],
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
  // set all docs to no access
  await app.create(Mockers.DocMeta, {
    workspaceId: workspace.id,
    docId: 'doc-0',
    defaultRole: DocRole.None,
  });
  await app.create(Mockers.DocMeta, {
    workspaceId: workspace.id,
    docId: 'doc-1',
    defaultRole: DocRole.None,
  });
  await app.create(Mockers.DocMeta, {
    workspaceId: workspace.id,
    docId: 'doc-2',
    defaultRole: DocRole.None,
  });

  // owner can read all docs
  const result = await app.gql({
    query: indexerSearchQuery,
    variables: {
      id: workspace.id,
      input: {
        table: SearchTable.block,
        query: {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspace.id,
        },
        options: {
          fields: ['docId', 'blockId', 'refDocId', 'ref'],
          pagination: {
            limit: 100,
          },
        },
      },
    },
  });

  t.snapshot(result.workspace.search.nodes);

  // other user can only read docs that they have read permission
  const other = await app.signup();
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: other.id,
  });
  await app.create(Mockers.DocUser, {
    workspaceId: workspace.id,
    docId: 'doc-0',
    userId: other.id,
    type: DocRole.Reader,
  });
  await app.create(Mockers.DocUser, {
    workspaceId: workspace.id,
    docId: 'doc-1',
    userId: other.id,
    type: DocRole.Manager,
  });

  const otherResult = await app.gql({
    query: indexerSearchQuery,
    variables: {
      id: workspace.id,
      input: {
        table: SearchTable.block,
        query: {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspace.id,
        },
        options: {
          fields: ['docId', 'blockId', 'refDocId', 'ref'],
          pagination: {
            limit: 100,
          },
        },
      },
    },
  });

  t.snapshot(otherResult.workspace.search.nodes);
});

e2e('should return empty results when search not match any docs', async t => {
  const owner = await app.signup();
  const workspace = await app.create(Mockers.Workspace, {
    owner,
  });

  const result = await app.gql({
    query: indexerSearchQuery,
    variables: {
      id: workspace.id,
      input: {
        table: SearchTable.block,
        query: {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspace.id,
        },
        options: {
          fields: ['docId', 'blockId', 'refDocId', 'ref'],
          pagination: {
            limit: 100,
          },
        },
      },
    },
  });

  t.snapshot(result);
});

e2e('should return empty nodes when docId not exists', async t => {
  const owner = await app.signup();
  const workspace = await app.create(Mockers.Workspace, {
    owner,
  });

  const result = await app.gql({
    query: indexerSearchQuery,
    variables: {
      id: workspace.id,
      input: {
        table: SearchTable.doc,
        query: {
          type: SearchQueryType.match,
          field: 'docId',
          match: 'not-exists-doc-id',
        },
        options: {
          fields: ['summary'],
          pagination: {
            limit: 1,
          },
        },
      },
    },
  });

  t.snapshot(result);
});

e2e(
  'should empty doc summary string when doc exists but no summary',
  async t => {
    const owner = await app.signup();
    const workspace = await app.create(Mockers.Workspace, {
      owner,
    });

    const indexerService = app.get(IndexerService);

    await indexerService.write(
      SearchTable.doc,
      [
        {
          docId: 'doc-1-without-summary',
          workspaceId: workspace.id,
          title: 'test1',
          summary: '',
          createdByUserId: owner.id,
          updatedByUserId: owner.id,
          createdAt: new Date('2025-04-22T00:00:00.000Z'),
          updatedAt: new Date('2025-04-22T00:00:00.000Z'),
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
          table: SearchTable.doc,
          query: {
            type: SearchQueryType.match,
            field: 'docId',
            match: 'doc-1-without-summary',
          },
          options: {
            fields: ['summary'],
            pagination: {
              limit: 1,
            },
          },
        },
      },
    });

    t.snapshot(result.workspace.search.nodes);
  }
);
