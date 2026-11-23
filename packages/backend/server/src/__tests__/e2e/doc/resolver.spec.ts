import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';

import {
  DocRole as GraphQLDocRole,
  getDocRolePermissionsQuery,
  getRecentlyUpdatedDocsQuery,
  getWorkspacePageByIdQuery,
  grantDocUserRolesMutation,
  type GraphQLQuery,
  listHistoryQuery,
  publishPageMutation,
  revokeDocUserRolesMutation,
  revokePublicPageMutation,
  updateDocDefaultRoleMutation,
  updateDocUserRoleMutation,
} from '@affine/graphql';
import { GraphQLError } from 'graphql';
import {
  applyUpdate,
  Array as YArray,
  decodeUpdate,
  Doc as YDoc,
  encodeStateAsUpdate,
  Map as YMap,
} from 'yjs';

import { BackendRuntimeProvider } from '../../../core/backend-runtime';
import { DocReader, DocWriter } from '../../../core/doc';
import { PermissionAccess } from '../../../core/permission';
import { DocRole, WorkspaceRole } from '../../../models';
import { createDocWithMarkdown } from '../../../native';
import {
  buildDocUpdateHandler,
  buildDocUpdateMetaHandler,
} from '../../../plugins/copilot/tools/doc-write';
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

e2e('should filter recently updated docs by doc read permission', async t => {
  const owner = await app.signup();
  const member = await app.createUser();
  await app.login(member);

  await app.switchUser(owner);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: member.id,
    type: WorkspaceRole.Collaborator,
  });

  const privateSnapshot = await app.create(Mockers.DocSnapshot, {
    workspaceId: workspace.id,
    user: owner,
  });
  await app.create(Mockers.DocMeta, {
    workspaceId: workspace.id,
    docId: privateSnapshot.id,
    title: 'private-doc',
    defaultRole: DocRole.None,
  });

  const publicSnapshot = await app.create(Mockers.DocSnapshot, {
    workspaceId: workspace.id,
    user: owner,
  });
  const publicDoc = await app.create(Mockers.DocMeta, {
    workspaceId: workspace.id,
    docId: publicSnapshot.id,
    title: 'public-doc',
    defaultRole: DocRole.None,
    public: true,
  });

  await app.switchUser(member);
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

  t.is(recentlyUpdatedDocs.totalCount, 1);
  t.deepEqual(
    recentlyUpdatedDocs.edges.map(edge => edge.node.id),
    [publicDoc.docId]
  );
});

e2e('should reject publishing when doc snapshot does not exist', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  const docId = randomUUID();

  await t.throwsAsync(
    app.gql({
      query: getWorkspacePageByIdQuery,
      variables: { workspaceId: workspace.id, pageId: docId },
    }),
    { message: `Doc ${docId} under Space ${workspace.id} not found.` }
  );

  const error = await t.throwsAsync<GraphQLError>(
    app.gql({
      query: publishPageMutation,
      variables: { workspaceId: workspace.id, pageId: docId },
    }),
    { instanceOf: GraphQLError }
  );
  t.like(error?.extensions, {
    status: 404,
    code: 'Not Found',
    name: 'NOT_FOUND',
  });
});

e2e('should get doc with title and summary', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  const docSnapshot = await app.create(Mockers.DocSnapshot, {
    workspaceId: workspace.id,
    user: owner,
  });
  const doc = await app.create(Mockers.DocMeta, {
    workspaceId: workspace.id,
    docId: docSnapshot.id,
    title: 'doc1',
    summary: 'summary1',
  });

  const result = await app.gql({
    query: getWorkspacePageByIdQuery,
    variables: { workspaceId: workspace.id, pageId: doc.docId },
  });

  t.is(result.workspace.doc.title, doc.title);
  t.is(result.workspace.doc.summary, doc.summary);
});

e2e('should get doc with title and null summary', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  const docSnapshot = await app.create(Mockers.DocSnapshot, {
    workspaceId: workspace.id,
    user: owner,
  });
  const doc = await app.create(Mockers.DocMeta, {
    workspaceId: workspace.id,
    docId: docSnapshot.id,
    title: 'doc1',
  });

  const result = await app.gql({
    query: getWorkspacePageByIdQuery,
    variables: { workspaceId: workspace.id, pageId: doc.docId },
  });

  t.is(result.workspace.doc.title, doc.title);
  t.is(result.workspace.doc.summary, null);
});

e2e('should require owner or admin to query workspace docs', async t => {
  const owner = await app.signup();
  const member = await app.createUser();
  await app.login(member);

  await app.switchUser(owner);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: member.id,
    type: WorkspaceRole.Collaborator,
  });

  const docSnapshot = await app.create(Mockers.DocSnapshot, {
    workspaceId: workspace.id,
    user: owner,
  });
  await app.create(Mockers.DocMeta, {
    workspaceId: workspace.id,
    docId: docSnapshot.id,
    title: 'private-doc',
    defaultRole: DocRole.None,
  });

  await app.switchUser(member);
  await t.throwsAsync(
    app.gql({
      query: {
        id: 'workspaceDocsPermissionCheck',
        op: 'workspaceDocsPermissionCheck',
        query: `
          query {
            workspace(id: "${workspace.id}") {
              docs(pagination: { first: 10 }) {
                totalCount
              }
            }
          }
        `,
      } satisfies GraphQLQuery,
      variables: undefined,
    })
  );
});

e2e('should require Doc.Read to query workspace page meta', async t => {
  const owner = await app.signup();
  const member = await app.createUser();
  await app.login(member);

  await app.switchUser(owner);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: member.id,
    type: WorkspaceRole.Collaborator,
  });

  const docSnapshot = await app.create(Mockers.DocSnapshot, {
    workspaceId: workspace.id,
    user: owner,
  });
  const doc = await app.create(Mockers.DocMeta, {
    workspaceId: workspace.id,
    docId: docSnapshot.id,
    title: 'private-doc',
    defaultRole: DocRole.None,
  });

  await app.switchUser(member);
  await t.throwsAsync(
    app.gql({
      query: {
        id: 'workspacePageMetaPermissionCheck',
        op: 'workspacePageMetaPermissionCheck',
        query: `
          query {
            workspace(id: "${workspace.id}") {
              pageMeta(pageId: "${doc.docId}") {
                createdAt
              }
            }
          }
        `,
      } satisfies GraphQLQuery,
      variables: undefined,
    })
  );
});

e2e.serial(
  'legacy document reads, permissions and sharing use the physical identity',
  async t => {
    const owner = await app.signup();
    const member = await app.createUser();
    await app.login(member);

    await app.switchUser(owner);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    await app.create(Mockers.WorkspaceUser, {
      workspaceId: workspace.id,
      userId: member.id,
      type: WorkspaceRole.Collaborator,
    });

    const physicalId = randomUUID();
    const docSnapshot = await app.create(Mockers.DocSnapshot, {
      workspaceId: workspace.id,
      user: owner,
      docId: physicalId,
      blob: createDocWithMarkdown(
        'current physical title',
        'current physical body',
        physicalId
      ),
    });
    const doc = await app.create(Mockers.DocMeta, {
      workspaceId: workspace.id,
      docId: docSnapshot.id,
      title: 'private-doc',
      defaultRole: DocRole.None,
    });

    const logicalId = randomUUID();
    const stale = new YDoc();
    stale.getText('content').insert(0, 'stale logical mirror');
    const staleBytes = Buffer.from(encodeStateAsUpdate(stale));
    await app.create(Mockers.DocSnapshot, {
      workspaceId: workspace.id,
      user: owner,
      docId: logicalId,
      blob: staleBytes,
    });
    await app.create(Mockers.DocMeta, {
      workspaceId: workspace.id,
      docId: logicalId,
      defaultRole: DocRole.Reader,
    });
    const root = new YDoc();
    const pages = new YArray<YMap<unknown>>();
    const page = new YMap<unknown>();
    page.set('id', logicalId);
    pages.push([page]);
    root.getMap('meta').set('pages', pages);
    root.getMap('spaces').set(logicalId, new YDoc({ guid: doc.docId }));
    await app.models.doc.createUpdates([
      {
        spaceId: workspace.id,
        docId: workspace.id,
        blob: Buffer.from(encodeStateAsUpdate(root)),
        timestamp: Date.now(),
        editorId: owner.id,
      },
    ]);
    const runtime = app.get(BackendRuntimeProvider);
    const activation = mock.method(
      runtime,
      'getWorkspaceLifecycleActiveV1',
      async () => false
    );
    const historyTime = Date.now();
    await app.models.history.create(
      {
        spaceId: workspace.id,
        docId: doc.docId,
        timestamp: historyTime,
        blob: Buffer.from(docSnapshot.blob),
        editorId: owner.id,
      },
      86400000
    );
    const query = {
      query: listHistoryQuery,
      variables: { workspaceId: workspace.id, pageDocId: `space:${logicalId}` },
    };
    const updateDoc = buildDocUpdateHandler(
      app.get(DocWriter),
      app.get(PermissionAccess),
      app.get(DocReader)
    );
    const updateMeta = buildDocUpdateMetaHandler(
      app.get(DocWriter),
      app.get(PermissionAccess),
      app.get(DocReader)
    );
    const toolOptions = { user: member.id, workspace: workspace.id };
    const snapshotFacts = (binary: Uint8Array) => {
      const doc = new YDoc({ gc: false });
      try {
        applyUpdate(doc, binary);
        return {
          blocks: doc.getMap('blocks').toJSON(),
          content: doc.getText('content').toString(),
          update: decodeUpdate(encodeStateAsUpdate(doc)),
          pendingStructs: doc.store.pendingStructs,
          pendingDs: doc.store.pendingDs,
        };
      } finally {
        doc.destroy();
      }
    };
    try {
      await t.throwsAsync(updateDoc(toolOptions, logicalId, 'updated body'));
      await t.throwsAsync(updateMeta(toolOptions, logicalId, 'updated title'));
      await app.switchUser(member);
      await t.throwsAsync(app.gql(query));
      await t.throwsAsync(
        app.gql({
          query: getDocRolePermissionsQuery,
          variables: { workspaceId: workspace.id, docId: logicalId },
        })
      );
      await app
        .GET(`/api/workspaces/${workspace.id}/docs/${logicalId}`)
        .expect(403);
      await app
        .GET(`/api/workspaces/${workspace.id}/public-docs/${logicalId}`)
        .expect(403);
      await app
        .GET(
          `/api/workspaces/${workspace.id}/docs/${logicalId}/histories/${new Date(historyTime).toISOString()}`
        )
        .expect(403);
      await app.models.docAccessPolicy.upsert(workspace.id, doc.docId, {
        defaultRole: DocRole.Manager,
      });
      await app.models.docAccessPolicy.upsert(workspace.id, logicalId, {
        defaultRole: DocRole.None,
      });
      const response = await app
        .GET(`/api/workspaces/${workspace.id}/docs/${logicalId}`)
        .expect(200);
      t.deepEqual(
        snapshotFacts(response.body),
        snapshotFacts(docSnapshot.blob)
      );
      const publicResponse = await app
        .GET(`/api/workspaces/${workspace.id}/public-docs/${logicalId}`)
        .expect(200);
      t.deepEqual(
        snapshotFacts(publicResponse.body),
        snapshotFacts(docSnapshot.blob)
      );
      const history = await app
        .GET(
          `/api/workspaces/${workspace.id}/docs/${logicalId}/histories/${new Date(historyTime).toISOString()}`
        )
        .expect(200);
      t.deepEqual(snapshotFacts(history.body), snapshotFacts(docSnapshot.blob));
      t.truthy(await app.gql(query));
      t.like(await updateDoc(toolOptions, logicalId, 'updated body'), {
        success: true,
        docId: doc.docId,
      });
      t.like(await updateMeta(toolOptions, logicalId, 'updated title'), {
        success: true,
        docId: doc.docId,
      });
      const savedRoot = await app
        .get(DocReader)
        .getDoc(workspace.id, workspace.id);
      const loadedRoot = new YDoc();
      applyUpdate(loadedRoot, savedRoot!.bin);
      t.like(loadedRoot.getMap('meta').toJSON().pages, [
        { id: logicalId, title: 'updated title' },
      ]);
      loadedRoot.destroy();
      await app.switchUser(owner);
      const input = { workspaceId: workspace.id, docId: logicalId };
      await app.models.docAccessPolicy.upsert(workspace.id, logicalId, {
        defaultRole: DocRole.Reader,
      });
      await app.gql({
        query: updateDocDefaultRoleMutation,
        variables: {
          input: { ...input, role: GraphQLDocRole.None },
        },
      });
      t.is(
        (await app.models.doc.getDocInfo(workspace.id, physicalId))
          ?.defaultRole,
        DocRole.None
      );
      t.is(
        (await app.models.doc.getDocInfo(workspace.id, logicalId))?.defaultRole,
        DocRole.Reader
      );
      await app.models.docAccessPolicy.upsert(workspace.id, logicalId, {
        defaultRole: DocRole.None,
      });
      await app.gql({
        query: grantDocUserRolesMutation,
        variables: {
          input: {
            ...input,
            userIds: [member.id],
            role: GraphQLDocRole.Reader,
          },
        },
      });
      t.is(
        (await app.models.docUser.get(workspace.id, physicalId, member.id))
          ?.type,
        DocRole.Reader
      );
      t.is(
        await app.models.docUser.get(workspace.id, logicalId, member.id),
        null
      );
      await app.switchUser(member);
      const permissions = await app.gql({
        query: getDocRolePermissionsQuery,
        variables: input,
      });
      t.true(permissions.workspace.doc.permissions.Doc_Read);
      t.false(permissions.workspace.doc.permissions.Doc_Update);
      await app.switchUser(owner);
      await app.gql({
        query: updateDocUserRoleMutation,
        variables: {
          input: { ...input, userId: member.id, role: GraphQLDocRole.Editor },
        },
      });
      t.is(
        (await app.models.docUser.get(workspace.id, physicalId, member.id))
          ?.type,
        DocRole.Editor
      );
      await app.gql({
        query: revokeDocUserRolesMutation,
        variables: {
          input: { ...input, userId: member.id },
        },
      });
      t.is(
        await app.models.docUser.get(workspace.id, physicalId, member.id),
        null
      );
      await app.gql({
        query: publishPageMutation,
        variables: {
          workspaceId: workspace.id,
          pageId: logicalId,
        },
      });
      t.true(
        (await app.models.doc.getDocInfo(workspace.id, physicalId))!.public
      );
      t.false(
        (await app.models.doc.getDocInfo(workspace.id, logicalId))!.public
      );
      await app.switchUser(member);
      for (const requestedId of [logicalId, physicalId]) {
        const publicRoot = await app
          .GET(
            `/api/workspaces/${workspace.id}/public-docs/${requestedId}/root-doc`
          )
          .expect(200);
        const decoded = new YDoc();
        applyUpdate(decoded, publicRoot.body);
        const entries = decoded.getMap('meta').get('pages') as YArray<
          YMap<unknown>
        >;
        t.deepEqual(
          entries.toArray().map(page => page.get('id')),
          [requestedId]
        );
        decoded.destroy();
        const body = await app
          .GET(`/api/workspaces/${workspace.id}/public-docs/${requestedId}`)
          .expect(200);
        const current = await app
          .get(DocReader)
          .getDoc(workspace.id, physicalId);
        t.deepEqual(snapshotFacts(body.body), snapshotFacts(current!.bin));
        t.notDeepEqual(snapshotFacts(body.body), snapshotFacts(staleBytes));
      }
      await app.switchUser(owner);
      await app.gql({
        query: revokePublicPageMutation,
        variables: {
          workspaceId: workspace.id,
          pageId: logicalId,
        },
      });
      t.false(
        (await app.models.doc.getDocInfo(workspace.id, physicalId))!.public
      );
      await runtime.executeDomainCommandV1({
        command: 'publish_doc',
        actorUserId: owner.id,
        workspaceId: workspace.id,
        docId: logicalId,
        mode: 0,
      });
      await app.switchUser(member);
      for (const requestedId of [logicalId, physicalId]) {
        await app
          .GET(
            `/api/workspaces/${workspace.id}/public-docs/${requestedId}/root-doc`
          )
          .expect(403);
      }
      await runtime.executeDomainCommandV1({
        command: 'unpublish_doc',
        actorUserId: owner.id,
        workspaceId: workspace.id,
        docId: logicalId,
      });
      activation.mock.mockImplementation(async () => true);
      await app
        .GET(`/api/workspaces/${workspace.id}/docs/${logicalId}`)
        .expect(403);
      await app.switchUser(owner);
      const active = await app
        .GET(`/api/workspaces/${workspace.id}/docs/${logicalId}`)
        .expect(200);
      t.deepEqual(snapshotFacts(active.body), snapshotFacts(staleBytes));
    } finally {
      activation.mock.restore();
      root.destroy();
      stale.destroy();
    }
  }
);
