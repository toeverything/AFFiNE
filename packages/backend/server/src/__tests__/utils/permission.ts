import { DocRole } from '../../core/permission/types';
import { TestingApp } from './testing-app';

export async function grantDocUserRoles(
  app: TestingApp,
  workspaceId: string,
  docId: string,
  userIds: string[],
  role: DocRole
) {
  return await app.gql(`
    mutation {
      grantDocUserRoles(input: {
        workspaceId: "${workspaceId}",
        docId: "${docId}",
        userIds: ["${userIds.join('","')}"],
        role: ${DocRole[role]}
      })
    }
  `);
}

export async function revokeDocUserRoles(
  app: TestingApp,
  workspaceId: string,
  docId: string,
  userId: string
) {
  return await app.gql(`
    mutation {
      revokeDocUserRoles(input: {
        workspaceId: "${workspaceId}",
        docId: "${docId}",
        userId: "${userId}"
      })
    }
  `);
}

export async function updateDocDefaultRole(
  app: TestingApp,
  workspaceId: string,
  docId: string,
  role: DocRole
) {
  return await app.gql(`
    mutation {
      updateDocDefaultRole(input: {
        workspaceId: "${workspaceId}",
        docId: "${docId}",
        role: ${DocRole[role]}
      })
    }
  `);
}

export async function docGrantedUsersList(
  app: TestingApp,
  workspaceId: string,
  docId: string,
  first = 10,
  offset = 0
) {
  return await app.gql(`
    query {
      workspace(id: "${workspaceId}") {
        doc(docId: "${docId}") {
          grantedUsersList(pagination: { first: ${first}, offset: ${offset} }) {
            totalCount
            edges {
            cursor
              node {
                role
                user {
                  id
                }
              }
            }
          }
        }
      }
    }
  `);
}
