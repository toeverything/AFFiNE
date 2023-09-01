import { deepEqual, ok } from 'node:assert';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import test from 'ava';
// @ts-expect-error graphql-upload is not typed
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';
import request from 'supertest';

import { AppModule } from '../app';
import {
  collectAllBlobSizes,
  collectBlobSizes,
  createWorkspace,
  listBlobs,
  setBlob,
  signUp,
} from './utils';

let app: INestApplication;

const client = new PrismaClient();

// cleanup database before each test
test.beforeEach(async () => {
  await client.$connect();
  await client.user.deleteMany({});
  await client.snapshot.deleteMany({});
  await client.update.deleteMany({});
  await client.workspace.deleteMany({});
  await client.$disconnect();
});

test.beforeEach(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  app.use(
    graphqlUploadExpress({
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
  await app.init();
});

test.afterEach(async () => {
  await app.close();
});

test('should set blobs', async t => {
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);

  const buffer1 = Buffer.from([0, 0]);
  const hash1 = await setBlob(app, u1.token.token, workspace.id, buffer1);
  const buffer2 = Buffer.from([0, 1]);
  const hash2 = await setBlob(app, u1.token.token, workspace.id, buffer2);

  const server = app.getHttpServer();

  const response1 = await request(server)
    .get(`/api/workspaces/${workspace.id}/blobs/${hash1}`)
    .auth(u1.token.token, { type: 'bearer' })
    .buffer();

  deepEqual(response1.body, buffer1, 'failed to get blob');

  const response2 = await request(server)
    .get(`/api/workspaces/${workspace.id}/blobs/${hash2}`)
    .auth(u1.token.token, { type: 'bearer' })
    .buffer();

  deepEqual(response2.body, buffer2, 'failed to get blob');
  t.pass();
});

test('should list blobs', async t => {
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);
  const blobs = await listBlobs(app, u1.token.token, workspace.id);
  ok(blobs.length === 0, 'failed to list blobs');

  const buffer1 = Buffer.from([0, 0]);
  const hash1 = await setBlob(app, u1.token.token, workspace.id, buffer1);
  const buffer2 = Buffer.from([0, 1]);
  const hash2 = await setBlob(app, u1.token.token, workspace.id, buffer2);

  const ret = await listBlobs(app, u1.token.token, workspace.id);
  ok(ret.length === 2, 'failed to list blobs');
  ok(ret[0] === hash1, 'failed to list blobs');
  ok(ret[1] === hash2, 'failed to list blobs');
  t.pass();
});

test('should calc blobs size', async t => {
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);

  const buffer1 = Buffer.from([0, 0]);
  await setBlob(app, u1.token.token, workspace.id, buffer1);
  const buffer2 = Buffer.from([0, 1]);
  await setBlob(app, u1.token.token, workspace.id, buffer2);

  const size = await collectBlobSizes(app, u1.token.token, workspace.id);
  ok(size === 4, 'failed to collect blob sizes');
  t.pass();
});

test('should calc all blobs size', async t => {
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');

  const workspace1 = await createWorkspace(app, u1.token.token);

  const buffer1 = Buffer.from([0, 0]);
  await setBlob(app, u1.token.token, workspace1.id, buffer1);
  const buffer2 = Buffer.from([0, 1]);
  await setBlob(app, u1.token.token, workspace1.id, buffer2);

  const workspace2 = await createWorkspace(app, u1.token.token);

  const buffer3 = Buffer.from([0, 0]);
  await setBlob(app, u1.token.token, workspace2.id, buffer3);
  const buffer4 = Buffer.from([0, 1]);
  await setBlob(app, u1.token.token, workspace2.id, buffer4);

  const size = await collectAllBlobSizes(app, u1.token.token);
  ok(size === 8, 'failed to collect all blob sizes');
  t.pass();
});
