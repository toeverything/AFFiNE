import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { hashSync } from '@node-rs/argon2';
import { PrismaClient, type User } from '@prisma/client';
import request from 'supertest';

import type { TokenType } from '../src/modules/auth';
import type { UserType } from '../src/modules/users';
import type { InvitationType, WorkspaceType } from '../src/modules/workspaces';

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
              id, name, email, emailVerified, avatarUrl, createdAt, hasPassword,
              token { token }
            }
          }
        `,
    })
    .expect(200);
  return res.body.data.currentUser;
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

export async function getWorkspacePublicPages(
  app: INestApplication,
  token: string,
  workspaceId: string
) {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
          query {
            workspace(id: "${workspaceId}") {
              publicPages {
                id
                mode
              }
            }
          }
        `,
    })
    .expect(200);
  return res.body.data.workspace.publicPages;
}

async function getWorkspace(
  app: INestApplication,
  token: string,
  workspaceId: string,
  skip = 0,
  take = 8
): Promise<WorkspaceType> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
          query {
            workspace(id: "${workspaceId}") {
              id, members(skip: ${skip}, take: ${take}) { id, name, email, permission, inviteId }
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
  inviteId: string,
  sendAcceptMail = false
): Promise<boolean> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
          mutation {
            acceptInviteById(workspaceId: "${workspaceId}", inviteId: "${inviteId}", sendAcceptMail: ${sendAcceptMail})
          }
        `,
    })
    .expect(200);
  return res.body.data.acceptInviteById;
}

async function leaveWorkspace(
  app: INestApplication,
  token: string,
  workspaceId: string,
  sendLeaveMail = false
): Promise<boolean> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
          mutation {
            leaveWorkspace(workspaceId: "${workspaceId}", workspaceName: "test workspace", sendLeaveMail: ${sendLeaveMail})
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

async function publishPage(
  app: INestApplication,
  token: string,
  workspaceId: string,
  pageId: string
) {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
          mutation {
            publishPage(workspaceId: "${workspaceId}", pageId: "${pageId}") {
              id
              mode
            }
          }
        `,
    })
    .expect(200);
  return res.body.errors?.[0]?.message || res.body.data?.publishPage;
}

async function revokePublicPage(
  app: INestApplication,
  token: string,
  workspaceId: string,
  pageId: string
) {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
          mutation {
            revokePublicPage(workspaceId: "${workspaceId}", pageId: "${pageId}") {
              id
              mode
              public
            }
          }
        `,
    })
    .expect(200);
  return res.body.errors?.[0]?.message || res.body.data?.revokePublicPage;
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

async function collectBlobSizes(
  app: INestApplication,
  token: string,
  workspaceId: string
): Promise<number> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .send({
      query: `
            query {
              collectBlobSizes(workspaceId: "${workspaceId}") {
                size
              }
            }
          `,
    })
    .expect(200);
  return res.body.data.collectBlobSizes.size;
}

async function collectAllBlobSizes(
  app: INestApplication,
  token: string
): Promise<number> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .send({
      query: `
            query {
              collectAllBlobSizes {
                size
              }
            }
          `,
    })
    .expect(200);
  return res.body.data.collectAllBlobSizes.size;
}

async function checkBlobSize(
  app: INestApplication,
  token: string,
  workspaceId: string,
  size: number
): Promise<number> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .send({
      query: `query checkBlobSize($workspaceId: String!, $size: Float!) {
        checkBlobSize(workspaceId: $workspaceId, size: $size) {
          size
        }
      }`,
      variables: { workspaceId, size },
    })
    .expect(200);
  return res.body.data.checkBlobSize.size;
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
                           WHERE schemaname != 'pg_catalog'
                             AND schemaname != 'information_schema'`;

  // remove all table data
  await client.$executeRawUnsafe(
    `TRUNCATE TABLE ${result
      .map(({ tablename }) => tablename)
      .filter(name => !name.includes('migrations'))
      .join(', ')}`
  );

  await client.$disconnect();
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
  return res.body.data.getInviteInfo;
}

async function sendChangeEmail(
  app: INestApplication,
  userToken: string,
  email: string,
  callbackUrl: string
): Promise<boolean> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(userToken, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
          mutation {
            sendChangeEmail(email: "${email}", callbackUrl: "${callbackUrl}")
          }
        `,
    })
    .expect(200);

  return res.body.data.sendChangeEmail;
}

async function sendVerifyChangeEmail(
  app: INestApplication,
  userToken: string,
  token: string,
  email: string,
  callbackUrl: string
): Promise<boolean> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(userToken, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
          mutation {
            sendVerifyChangeEmail(token:"${token}", email: "${email}", callbackUrl: "${callbackUrl}")
          }
        `,
    })
    .expect(200);

  return res.body.data.sendVerifyChangeEmail;
}

async function changeEmail(
  app: INestApplication,
  userToken: string,
  token: string
): Promise<UserType & { token: TokenType }> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(userToken, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
          mutation {
             changeEmail(token: "${token}") {
              id
              name
              avatarUrl
              email
            }
          }
        `,
    })
    .expect(200);
  return res.body.data.changeEmail;
}

export class FakePrisma {
  fakeUser: User = {
    id: randomUUID(),
    name: 'Alex Yang',
    avatarUrl: '',
    email: 'alex.yang@example.org',
    password: hashSync('123456'),
    emailVerified: new Date(),
    createdAt: new Date(),
  };

  get user() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const prisma = this;
    return {
      async findFirst() {
        return prisma.fakeUser;
      },
      async findUnique() {
        return this.findFirst();
      },
      async update() {
        return this.findFirst();
      },
    };
  }
}

export {
  acceptInviteById,
  changeEmail,
  checkBlobSize,
  collectAllBlobSizes,
  collectBlobSizes,
  createWorkspace,
  currentUser,
  flushDB,
  getInviteInfo,
  getPublicWorkspace,
  getWorkspace,
  inviteUser,
  leaveWorkspace,
  listBlobs,
  publishPage,
  revokePublicPage,
  revokeUser,
  sendChangeEmail,
  sendVerifyChangeEmail,
  setBlob,
  signUp,
  updateWorkspace,
};
