import {
  indexerSearchQuery,
  SearchQueryType,
  SearchTable,
} from '@affine/graphql';

import { Config } from '../../../base';
import { BackendRuntimeProvider } from '../../../core/backend-runtime';
import { DocRole } from '../../../models';
import { createDocWithMarkdown } from '../../../native';
import { Mockers } from '../../mocks';
import { app, e2e } from '../test';

const indexerE2e = app.get(Config).indexer.enabled ? e2e : e2e.skip;

async function indexDoc(
  workspaceId: string,
  user: { id: string },
  docId: string,
  markdown: string,
  defaultRole = DocRole.Manager
) {
  await app.create(Mockers.DocMeta, { workspaceId, docId, defaultRole });
  await app.create(Mockers.DocSnapshot, {
    workspaceId,
    docId,
    user,
    blob: createDocWithMarkdown(docId, markdown, docId),
  });
  await app.get(BackendRuntimeProvider).reconcileSearchProjection(1000);
}

indexerE2e('should search with query', async t => {
  const owner = await app.signup();
  const workspace = await app.create(Mockers.Workspace, {
    owner,
    snapshot: true,
  });
  await indexDoc(
    workspace.id,
    owner,
    'doc-0',
    'searchable first\n\nsearchable second'
  );

  const result = await app.gql({
    query: indexerSearchQuery,
    variables: {
      id: workspace.id,
      input: {
        table: SearchTable.block,
        query: {
          type: SearchQueryType.match,
          field: 'content',
          match: 'searchable',
        },
        options: {
          fields: ['docId', 'blockId', 'content'],
          highlights: [{ field: 'content', before: '<b>', end: '</b>' }],
          pagination: { limit: 100 },
        },
      },
    },
  });

  t.true(result.workspace.search.pagination.count > 0);
  t.true(
    result.workspace.search.nodes.every(node =>
      node.fields.docId.includes('doc-0')
    )
  );
  t.true(
    result.workspace.search.nodes.some(node =>
      node.highlights?.content?.some((value: string) => value.includes('<b>'))
    )
  );

  const firstPage = await app.gql({
    query: indexerSearchQuery,
    variables: {
      id: workspace.id,
      input: {
        table: SearchTable.block,
        query: {
          type: SearchQueryType.match,
          field: 'content',
          match: 'searchable',
        },
        options: {
          fields: ['docId', 'blockId'],
          pagination: { limit: 1 },
        },
      },
    },
  });
  const secondPage = await app.gql({
    query: indexerSearchQuery,
    variables: {
      id: workspace.id,
      input: {
        table: SearchTable.block,
        query: {
          type: SearchQueryType.match,
          field: 'content',
          match: 'searchable',
        },
        options: {
          fields: ['docId', 'blockId'],
          pagination: {
            limit: 1,
            cursor: firstPage.workspace.search.pagination.nextCursor,
          },
        },
      },
    },
  });
  t.not(
    firstPage.workspace.search.nodes[0].fields.blockId[0],
    secondPage.workspace.search.nodes[0].fields.blockId[0]
  );
});

indexerE2e(
  'should filter no read permission docs on team workspace',
  async t => {
    const owner = await app.signup();
    const workspace = await app.create(Mockers.Workspace, {
      owner,
      snapshot: true,
    });
    await app.create(Mockers.TeamWorkspace, { id: workspace.id });
    await indexDoc(
      workspace.id,
      owner,
      'private-doc',
      'team secret searchable',
      DocRole.None
    );

    const member = await app.signup();
    await app.create(Mockers.WorkspaceUser, {
      workspaceId: workspace.id,
      userId: member.id,
    });
    await app.get(BackendRuntimeProvider).reconcileSearchProjection(1000);
    const denied = await app.gql({
      query: indexerSearchQuery,
      variables: {
        id: workspace.id,
        input: {
          table: SearchTable.block,
          query: {
            type: SearchQueryType.match,
            field: 'content',
            match: 'secret',
          },
          options: { fields: ['docId'], pagination: { limit: 10 } },
        },
      },
    });
    t.is(denied.workspace.search.pagination.count, 0);

    await app.create(Mockers.DocUser, {
      workspaceId: workspace.id,
      docId: 'private-doc',
      userId: member.id,
      type: DocRole.Reader,
    });
    await app.get(BackendRuntimeProvider).reconcileSearchProjection(1000);
    const allowed = await app.gql({
      query: indexerSearchQuery,
      variables: {
        id: workspace.id,
        input: {
          table: SearchTable.block,
          query: {
            type: SearchQueryType.match,
            field: 'content',
            match: 'secret',
          },
          options: { fields: ['docId'], pagination: { limit: 10 } },
        },
      },
    });
    t.true(allowed.workspace.search.pagination.count > 0);

    await app.models.docUser.delete(workspace.id, 'private-doc', member.id);
    await app.get(BackendRuntimeProvider).reconcileSearchProjection(1000);
    const revoked = await app.gql({
      query: indexerSearchQuery,
      variables: {
        id: workspace.id,
        input: {
          table: SearchTable.block,
          query: {
            type: SearchQueryType.match,
            field: 'content',
            match: 'secret',
          },
          options: { fields: ['docId'], pagination: { limit: 10 } },
        },
      },
    });
    t.is(revoked.workspace.search.pagination.count, 0);
  }
);

indexerE2e(
  'should return empty results when search not match any docs',
  async t => {
    const owner = await app.signup();
    const workspace = await app.create(Mockers.Workspace, {
      owner,
      snapshot: true,
    });
    await app.get(BackendRuntimeProvider).reconcileSearchProjection(1000);
    const result = await app.gql({
      query: indexerSearchQuery,
      variables: {
        id: workspace.id,
        input: {
          table: SearchTable.doc,
          query: {
            type: SearchQueryType.match,
            field: 'title',
            match: 'absent',
          },
          options: { fields: ['docId'], pagination: { limit: 10 } },
        },
      },
    });
    t.is(result.workspace.search.pagination.count, 0);
    t.deepEqual(result.workspace.search.nodes, []);
  }
);
