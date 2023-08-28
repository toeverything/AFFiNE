import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
// @ts-expect-error graphql-upload is not typed
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';
import request from 'supertest';

import { AppModule } from '../app';
import type { TokenType } from '../modules/auth';
import type { UserType } from '../modules/users';
import type { InvitationType, WorkspaceType } from '../modules/workspaces';

export class NestDebugLogger implements LoggerService {
  log(message: string): any {
    console.log(message);
  }

  error(message: string, trace: string): any {
    console.error(message, trace);
  }

  warn(message: string): any {
    console.warn(message);
  }

  debug(message: string): any {
    console.debug(message);
  }

  verbose(message: string): any {
    console.log(message);
  }
}

const gql = '/graphql';

async function signUp(
  app: INestApplication,
  name: string,
  email: string,
  password: string
): Promise<UserType & { token: TokenType }> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
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

async function currentUser(app: INestApplication, token: string) {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
          query {
            currentUser {
              id, name, email, emailVerified, avatarUrl, createdAt, hasPassword
            }
          }
        `,
    })
    .expect(200);
  return res.body?.data?.currentUser;
}

async function createWorkspace(
  app: INestApplication,
  token: string
): Promise<WorkspaceType> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
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

export async function getWorkspaceSharedPages(
  app: INestApplication,
  token: string,
  workspaceId: string
): Promise<string[]> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
          query {
            workspace(id: "${workspaceId}") {
              sharedPages
            }
          }
        `,
    })
    .expect(200);
  return res.body.data.workspace.sharedPages;
}

async function getWorkspace(
  app: INestApplication,
  token: string,
  workspaceId: string
): Promise<WorkspaceType> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
          query {
            workspace(id: "${workspaceId}") {
              id, members { id, name, email, permission, inviteId }
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
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
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
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
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
  permission: string,
  sendInviteMail = false
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
          mutation {
            invite(workspaceId: "${workspaceId}", email: "${email}", permission: ${permission}, sendInviteMail: ${sendInviteMail})
          }
        `,
    })
    .expect(200);
  return res.body.data.invite;
}

async function acceptInviteById(
  app: INestApplication,
  workspaceId: string,
  inviteId: string
): Promise<boolean> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
          mutation {
            acceptInviteById(workspaceId: "${workspaceId}", inviteId: "${inviteId}")
          }
        `,
    })
    .expect(200);
  return res.body.data.acceptInviteById;
}

async function acceptInvite(
  app: INestApplication,
  token: string,
  workspaceId: string
): Promise<boolean> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
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
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
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
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
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
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
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
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
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
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
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
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
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

async function flushDB() {
  const client = new PrismaClient();
  await client.$connect();
  const result: { tablename: string }[] =
    await client.$queryRaw`SELECT tablename
                           FROM pg_catalog.pg_tables
                           WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema'`;

  // remove all table data
  await client.$executeRawUnsafe(
    `TRUNCATE TABLE ${result
      .map(({ tablename }) => tablename)
      .filter(name => !name.includes('migrations'))
      .join(', ')}`
  );

  await client.$disconnect();
}

async function createTestApp() {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = module.createNestApplication();
  app.use(
    graphqlUploadExpress({
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
  await app.init();
  return app;
}

async function getInviteInfo(
  app: INestApplication,
  token: string,
  inviteId: string
): Promise<InvitationType> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
          query {
            getInviteInfo(inviteId: "${inviteId}") {
              workspace {
                id
                name
                avatar
              }
              user {
                id
                name
                avatarUrl
              }
            }
          }
        `,
    })
    .expect(200);
  return res.body.data.workspace;
}

export {
  acceptInvite,
  acceptInviteById,
  createTestApp,
  createWorkspace,
  currentUser,
  flushDB,
  getInviteInfo,
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
