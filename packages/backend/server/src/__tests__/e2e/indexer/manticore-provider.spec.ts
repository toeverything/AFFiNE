import {
  indexerSearchDocsQuery,
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

const manticoreSearchEnabled =
  app.get(Config).indexer.enabled &&
  app.get(Config).indexer.provider.type === 'manticoresearch';
const manticoreSearchE2e = manticoreSearchEnabled ? e2e : e2e.skip;

async function indexDocument(
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
  await reconcileSearch();
}

async function reconcileSearch() {
  const runtime = app.get(BackendRuntimeProvider);
  for (let attempt = 0; attempt < 50; attempt++) {
    await runtime.reconcileSearchProjection(1000);
    if ((await runtime.searchStatus()).ready) return;
  }
  throw new Error('search projection did not become ready');
}

async function searchPage(
  workspaceId: string,
  match: string,
  pagination: { limit: number; cursor?: string }
) {
  const result = await app.gql({
    query: indexerSearchQuery,
    variables: {
      id: workspaceId,
      input: {
        table: SearchTable.block,
        query: {
          type: SearchQueryType.match,
          field: 'content',
          match,
        },
        options: {
          fields: ['docId', 'blockId'],
          pagination,
        },
      },
    },
  });
  return result.workspace.search;
}

async function searchCount(workspaceId: string, match: string) {
  return (await searchPage(workspaceId, match, { limit: 20 })).pagination.count;
}

async function searchDocsCount(workspaceId: string, keyword: string) {
  const result = await app.gql({
    query: indexerSearchDocsQuery,
    variables: {
      id: workspaceId,
      input: { keyword, limit: 20 },
    },
  });
  return result.workspace.searchDocs.length;
}

manticoreSearchE2e(
  'indexes and searches through the Manticore Search provider',
  async t => {
    const owner = await app.signup();
    const workspace = await app.create(Mockers.Workspace, {
      owner,
      snapshot: true,
    });
    const docId = `manticore-basic-${Date.now()}`;
    const marker = 'manticorebasicmarker';
    await indexDocument(
      workspace.id,
      owner,
      docId,
      `${marker} first block\n\nsecond block`
    );
    await indexDocument(
      workspace.id,
      owner,
      `${docId}-second`,
      `${marker} from a second document`
    );

    t.is(await searchCount(workspace.id, marker), 2);
    const basicDocs = await app.gql({
      query: indexerSearchDocsQuery,
      variables: {
        id: workspace.id,
        input: { keyword: marker, limit: 2 },
      },
    });
    t.is(basicDocs.workspace.searchDocs.length, 2);
    await t.throwsAsync(
      app.gql({
        query: indexerSearchDocsQuery,
        variables: {
          id: workspace.id,
          input: { keyword: marker, limit: 0 },
        },
      })
    );

    const firstPage = await searchPage(workspace.id, marker, { limit: 1 });
    const nextCursor = firstPage.pagination.nextCursor;
    t.truthy(nextCursor);
    const secondPage = await searchPage(workspace.id, marker, {
      limit: 1,
      cursor: nextCursor ?? undefined,
    });
    t.is(secondPage.nodes.length, 1);
    t.not(
      firstPage.nodes[0]?.fields.docId[0],
      secondPage.nodes[0]?.fields.docId[0]
    );
  }
);

manticoreSearchE2e(
  'enforces ACL changes through the Manticore Search provider',
  async t => {
    const owner = await app.signup();
    const workspace = await app.create(Mockers.Workspace, {
      owner,
      snapshot: true,
    });
    await app.create(Mockers.TeamWorkspace, { id: workspace.id });
    const marker = `manticore-acl-${Date.now()}`;
    await indexDocument(
      workspace.id,
      owner,
      `${marker}-doc`,
      marker,
      DocRole.None
    );

    const member = await app.signup();
    await app.create(Mockers.WorkspaceUser, {
      workspaceId: workspace.id,
      userId: member.id,
    });
    await reconcileSearch();
    t.is(await searchCount(workspace.id, marker), 0);
    t.is(await searchDocsCount(workspace.id, marker), 0);

    await app.create(Mockers.DocUser, {
      workspaceId: workspace.id,
      docId: `${marker}-doc`,
      userId: member.id,
      type: DocRole.Reader,
    });
    await reconcileSearch();
    t.true((await searchCount(workspace.id, marker)) > 0);
    t.true((await searchDocsCount(workspace.id, marker)) > 0);

    await app.models.docUser.delete(workspace.id, `${marker}-doc`, member.id);
    await reconcileSearch();
    t.is(await searchCount(workspace.id, marker), 0);
    t.is(await searchDocsCount(workspace.id, marker), 0);
  }
);
