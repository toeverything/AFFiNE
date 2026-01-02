import { WorkspaceRole } from '../../core/permission/types';
import type { WorkspaceType } from '../../core/workspaces';
import { TestingApp } from './testing-app';

export async function createWorkspace(app: TestingApp): Promise<WorkspaceType> {
  const res = await app
    .POST('/graphql')
    .set({
      'x-request-id': 'test',
      'x-operation-name': 'test',
    })
    .field(
      'operations',
      JSON.stringify({
        name: 'createWorkspace',
        query: `mutation createWorkspace($init: Upload!) {
              createWorkspace(init: $init) {
                id
              }
            }`,
        variables: { init: null },
      })
    )
    .field('map', JSON.stringify({ '0': ['variables.init'] }))
    .attach('0', Buffer.from([0, 0]), 'init.data');

  return res.body.data.createWorkspace;
}

export async function getWorkspacePublicDocs(
  app: TestingApp,
  workspaceId: string
) {
  const res = await app.gql(
    `
      query {
        workspace(id: "${workspaceId}") {
          publicDocs {
            id
            mode
          }
        }
      }
    `
  );

  return res.workspace.publicDocs;
}

export async function getWorkspace(
  app: TestingApp,
  workspaceId: string,
  skip = 0,
  take = 8
): Promise<WorkspaceType> {
  const res = await app.gql(
    `
      query {
        workspace(id: "${workspaceId}") {
          id,
          members(skip: ${skip}, take: ${take}) { id, name, email, permission, inviteId, status }
        }
      }
    `
  );

  return res.workspace;
}

export async function updateWorkspace(
  app: TestingApp,
  workspaceId: string,
  isPublic: boolean
): Promise<boolean> {
  const res = await app.gql(
    `
      mutation {
        updateWorkspace(input: { id: "${workspaceId}", public: ${isPublic} }) {
          public
        }
      }
    `
  );

  return res.updateWorkspace.public;
}

export async function setWorkspaceSharing(
  app: TestingApp,
  workspaceId: string,
  enableSharing: boolean
) {
  const res = await app.gql(
    `
      mutation {
        updateWorkspace(
          input: { id: "${workspaceId}", enableSharing: ${enableSharing} }
        ) {
          enableSharing
        }
      }
    `
  );

  return res.updateWorkspace.enableSharing as boolean;
}

export async function deleteWorkspace(
  app: TestingApp,
  workspaceId: string
): Promise<boolean> {
  const res = await app.gql(
    `
      mutation {
        deleteWorkspace(id: "${workspaceId}")
      }
    `
  );

  return res.deleteWorkspace;
}

export async function publishDoc(
  app: TestingApp,
  workspaceId: string,
  docId: string
) {
  const res = await app.gql(
    `
      mutation {
        publishDoc(workspaceId: "${workspaceId}", docId: "${docId}") {
          id
          mode
        }
      }
    `
  );

  return res.publishDoc;
}

export async function revokePublicDoc(
  app: TestingApp,
  workspaceId: string,
  docId: string
) {
  const res = await app.gql(
    `
      mutation {
        revokePublicDoc(workspaceId: "${workspaceId}", docId: "${docId}") {
          id
          mode
          public
        }
      }
    `
  );

  return res.revokePublicDoc;
}

export async function grantMember(
  app: TestingApp,
  workspaceId: string,
  userId: string,
  permission: WorkspaceRole
) {
  const res = await app.gql(
    `
      mutation {
        grantMember(
          workspaceId: "${workspaceId}"
          userId: "${userId}"
          permission: ${WorkspaceRole[permission]}
        )
      }
    `
  );

  return res.grantMember;
}

export async function revokeMember(
  app: TestingApp,
  workspaceId: string,
  userId: string
) {
  const res = await app.gql(
    `
      mutation {
        revoke(workspaceId: "${workspaceId}", userId: "${userId}")
      }
    `
  );

  return res.revoke;
}
