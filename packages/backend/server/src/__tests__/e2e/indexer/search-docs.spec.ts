import { indexerSearchDocsQuery, SearchTable } from '@affine/graphql';
import { omit } from 'lodash-es';

import { IndexerService } from '../../../plugins/indexer/service';
import { Mockers } from '../../mocks';
import { app, e2e } from '../test';

e2e('should search docs by keyword', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner,
  });

  const indexerService = app.get(IndexerService);

  await indexerService.write(
    SearchTable.block,
    [
      {
        docId: 'doc-0',
        workspaceId: workspace.id,
        content: 'test1 hello',
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
        content: 'test2 hello',
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
        content: 'test3 hello',
        flavour: 'markdown',
        blockId: 'block-2',
        refDocId: ['doc-0', 'doc-2'],
        ref: ['{"foo": "bar1"}', '{"foo": "bar3"}'],
        createdByUserId: owner.id,
        updatedByUserId: owner.id,
        createdAt: new Date('2025-03-22T00:00:00.000Z'),
        updatedAt: new Date('2025-03-22T03:00:01.000Z'),
      },
    ],
    {
      refresh: true,
    }
  );

  const result = await app.gql({
    query: indexerSearchDocsQuery,
    variables: {
      id: workspace.id,
      input: {
        keyword: 'hello',
      },
    },
  });

  t.is(result.workspace.searchDocs.length, 3);
  t.snapshot(
    result.workspace.searchDocs.map(doc =>
      omit(doc, 'createdByUser', 'updatedByUser')
    )
  );
});

e2e('should search docs by keyword with limit 1', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner,
  });

  const indexerService = app.get(IndexerService);

  await indexerService.write(
    SearchTable.block,
    [
      {
        docId: 'doc-0',
        workspaceId: workspace.id,
        content: 'test1 hello',
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
        content: 'test2 hello',
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
        content: 'test3 hello',
        flavour: 'markdown',
        blockId: 'block-2',
        refDocId: ['doc-0', 'doc-2'],
        ref: ['{"foo": "bar1"}', '{"foo": "bar3"}'],
        createdByUserId: owner.id,
        updatedByUserId: owner.id,
        createdAt: new Date('2025-03-22T00:00:00.000Z'),
        updatedAt: new Date('2025-03-22T03:00:01.000Z'),
      },
    ],
    {
      refresh: true,
    }
  );

  const result = await app.gql({
    query: indexerSearchDocsQuery,
    variables: {
      id: workspace.id,
      input: {
        keyword: 'hello',
        limit: 1,
      },
    },
  });

  t.is(result.workspace.searchDocs.length, 1);
  t.snapshot(
    result.workspace.searchDocs.map(doc =>
      omit(doc, 'createdByUser', 'updatedByUser')
    )
  );
});

e2e(
  'should search docs by keyword failed when workspace is no permission',
  async t => {
    const owner = await app.signup();

    const workspace = await app.create(Mockers.Workspace, {
      owner,
    });

    // signup another user
    await app.signup();

    await t.throwsAsync(
      app.gql({
        query: indexerSearchDocsQuery,
        variables: {
          id: workspace.id,
          input: {
            keyword: 'hello',
          },
        },
      }),
      {
        message: /You do not have permission to access Space/,
      }
    );
  }
);
