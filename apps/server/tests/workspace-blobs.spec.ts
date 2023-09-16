import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import test from 'ava';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';
import request from 'supertest';

import { AppModule } from '../src/app';
import {
  checkBlobSize,
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

test.afterEach.always(async () => {
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

  t.deepEqual(response1.body, buffer1, 'failed to get blob');

  const response2 = await request(server)
    .get(`/api/workspaces/${workspace.id}/blobs/${hash2}`)
    .auth(u1.token.token, { type: 'bearer' })
    .buffer();

  t.deepEqual(response2.body, buffer2, 'failed to get blob');
});

test('should list blobs', async t => {
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);
  const blobs = await listBlobs(app, u1.token.token, workspace.id);
  t.is(blobs.length, 0, 'failed to list blobs');

  const buffer1 = Buffer.from([0, 0]);
  const hash1 = await setBlob(app, u1.token.token, workspace.id, buffer1);
  const buffer2 = Buffer.from([0, 1]);
  const hash2 = await setBlob(app, u1.token.token, workspace.id, buffer2);

  const ret = await listBlobs(app, u1.token.token, workspace.id);
  t.is(ret.length, 2, 'failed to list blobs');
  t.is(ret[0], hash1, 'failed to list blobs');
  t.is(ret[1], hash2, 'failed to list blobs');
});

test('should calc blobs size', async t => {
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);

  const buffer1 = Buffer.from([0, 0]);
  await setBlob(app, u1.token.token, workspace.id, buffer1);
  const buffer2 = Buffer.from([0, 1]);
  await setBlob(app, u1.token.token, workspace.id, buffer2);

  const size = await collectBlobSizes(app, u1.token.token, workspace.id);
  t.is(size, 4, 'failed to collect blob sizes');
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
  t.is(size, 8, 'failed to collect all blob sizes');

  const size1 = await checkBlobSize(
    app,
    u1.token.token,
    workspace1.id,
    10 * 1024 * 1024 * 1024 - 8
  );
  t.is(size1, 0, 'failed to check blob size');

  const size2 = await checkBlobSize(
    app,
    u1.token.token,
    workspace1.id,
    10 * 1024 * 1024 * 1024 - 7
  );
  t.is(size2, -1, 'failed to check blob size');
});
