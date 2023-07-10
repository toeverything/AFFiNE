import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import type { TokenType } from '../modules/auth';
import type { UserType } from '../modules/users';
import type { WorkspaceType } from '../modules/workspaces';

const gql = '/graphql';

async function signUp(
  app: INestApplication,
  name: string,
  email: string,
  password: string
): Promise<UserType & { token: TokenType }> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .send({
      query: `
          mutation {
            signUp(name: "${name}", email: "${email}", password: "${password}") {
              id, name, email, token { token }
            }
          }
        `,
    })
    .expect(200);
  return res.body.data.signUp;
}

async function createWorkspace(
  app: INestApplication,
  token: string
): Promise<WorkspaceType> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
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
    .attach('0', Buffer.from([0, 0]), 'init.data')
    .expect(200);
  return res.body.data.createWorkspace;
}

async function getWorkspace(
  app: INestApplication,
  token: string,
  workspaceId: string
): Promise<WorkspaceType> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .send({
      query: `
          query {
            workspace(id: "${workspaceId}") {
              id, members { id, name, email, permission }
            }
          }
        `,
    })
    .expect(200);
  return res.body.data.workspace;
}

async function getPublicWorkspace(
  app: INestApplication,
  workspaceId: string
): Promise<WorkspaceType> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .send({
      query: `
          query {
            publicWorkspace(id: "${workspaceId}") {
              id
            }
          }
        `,
    })
    .expect(200);
  return res.body.data.publicWorkspace;
}

async function updateWorkspace(
  app: INestApplication,
  token: string,
  workspaceId: string,
  isPublic: boolean
): Promise<boolean> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .send({
      query: `
          mutation {
            updateWorkspace(input: { id: "${workspaceId}", public: ${isPublic} }) {
              public
            }
          }
        `,
    })
    .expect(200);
  return res.body.data.updateWorkspace.public;
}

async function inviteUser(
  app: INestApplication,
  token: string,
  workspaceId: string,
  email: string,
  permission: string
): Promise<boolean> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .send({
      query: `
          mutation {
            invite(workspaceId: "${workspaceId}", email: "${email}", permission: ${permission})
          }
        `,
    })
    .expect(200);
  return res.body.data.invite;
}

async function acceptInvite(
  app: INestApplication,
  token: string,
  workspaceId: string
): Promise<boolean> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .send({
      query: `
          mutation {
            acceptInvite(workspaceId: "${workspaceId}")
          }
        `,
    })
    .expect(200);
  return res.body.data.acceptInvite;
}

async function leaveWorkspace(
  app: INestApplication,
  token: string,
  workspaceId: string
): Promise<boolean> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .send({
      query: `
          mutation {
            leaveWorkspace(workspaceId: "${workspaceId}")
          }
        `,
    })
    .expect(200);
  return res.body.data.leaveWorkspace;
}

async function revokeUser(
  app: INestApplication,
  token: string,
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .send({
      query: `
          mutation {
            revoke(workspaceId: "${workspaceId}", userId: "${userId}")
          }
        `,
    })
    .expect(200);
  return res.body.data.revoke;
}

async function sharePage(
  app: INestApplication,
  token: string,
  workspaceId: string,
  pageId: string
): Promise<boolean | string> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .send({
      query: `
          mutation {
            sharePage(workspaceId: "${workspaceId}", pageId: "${pageId}")
          }
        `,
    })
    .expect(200);
  return res.body.errors?.[0]?.message || res.body.data?.sharePage;
}

async function revokePage(
  app: INestApplication,
  token: string,
  workspaceId: string,
  pageId: string
): Promise<boolean | string> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .send({
      query: `
          mutation {
            revokePage(workspaceId: "${workspaceId}", pageId: "${pageId}")
          }
        `,
    })
    .expect(200);
  return res.body.errors?.[0]?.message || res.body.data?.revokePage;
}

async function listBlobs(
  app: INestApplication,
  token: string,
  workspaceId: string
): Promise<string[]> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .send({
      query: `
          query {
            listBlobs(workspaceId: "${workspaceId}")
          }
        `,
    })
    .expect(200);
  return res.body.data.listBlobs;
}

async function setBlob(
  app: INestApplication,
  token: string,
  workspaceId: string,
  buffer: Buffer
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .field(
      'operations',
      JSON.stringify({
        name: 'setBlob',
        query: `mutation setBlob($blob: Upload!) {
            setBlob(workspaceId: "${workspaceId}", blob: $blob)
          }`,
        variables: { blob: null },
      })
    )
    .field('map', JSON.stringify({ '0': ['variables.blob'] }))
    .attach('0', buffer, 'blob.data')
    .expect(200);
  return res.body.data.setBlob;
}

export {
  acceptInvite,
  createWorkspace,
  getPublicWorkspace,
  getWorkspace,
  inviteUser,
  leaveWorkspace,
  listBlobs,
  revokePage,
  revokeUser,
  setBlob,
  sharePage,
  signUp,
  updateWorkspace,
};
