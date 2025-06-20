import { getRecentlyUpdatedDocsQuery } from '@affine/graphql';

import { Mockers } from '../../mocks';
import { app, e2e } from '../test';

e2e('should get recently updated docs', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  const docSnapshot1 = await app.create(Mockers.DocSnapshot, {
    workspaceId: workspace.id,
    user: owner,
  });
  const doc1 = await app.create(Mockers.DocMeta, {
    workspaceId: workspace.id,
    docId: docSnapshot1.id,
    title: 'doc1',
  });

  const docSnapshot2 = await app.create(Mockers.DocSnapshot, {
    workspaceId: workspace.id,
    user: owner,
  });
  const doc2 = await app.create(Mockers.DocMeta, {
    workspaceId: workspace.id,
    docId: docSnapshot2.id,
    title: 'doc2',
  });

  const docSnapshot3 = await app.create(Mockers.DocSnapshot, {
    workspaceId: workspace.id,
    user: owner,
  });
  const doc3 = await app.create(Mockers.DocMeta, {
    workspaceId: workspace.id,
    docId: docSnapshot3.id,
    title: 'doc3',
  });

  const {
    workspace: { recentlyUpdatedDocs },
  } = await app.gql({
    query: getRecentlyUpdatedDocsQuery,
    variables: {
      workspaceId: workspace.id,
      pagination: {
        first: 10,
      },
    },
  });

  t.is(recentlyUpdatedDocs.totalCount, 3);
  t.is(recentlyUpdatedDocs.edges[0].node.id, doc3.docId);
  t.is(recentlyUpdatedDocs.edges[0].node.title, doc3.title);
  t.is(recentlyUpdatedDocs.edges[1].node.id, doc2.docId);
  t.is(recentlyUpdatedDocs.edges[1].node.title, doc2.title);
  t.is(recentlyUpdatedDocs.edges[2].node.id, doc1.docId);
  t.is(recentlyUpdatedDocs.edges[2].node.title, doc1.title);
});
