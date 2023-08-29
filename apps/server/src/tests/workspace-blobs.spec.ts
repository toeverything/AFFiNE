import { deepEqual, ok } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
// @ts-expect-error graphql-upload is not typed
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';
import request from 'supertest';

import { AppModule } from '../app';
import { createWorkspace, listBlobs, setBlob, signUp } from './utils';

describe('Workspace Module - Blobs', () => {
  let app: INestApplication;

  const client = new PrismaClient();

  // cleanup database before each test
  beforeEach(async () => {
    await client.$connect();
    await client.user.deleteMany({});
    await client.snapshot.deleteMany({});
    await client.update.deleteMany({});
    await client.workspace.deleteMany({});
    await client.$disconnect();
  });

  beforeEach(async () => {
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

  afterEach(async () => {
    await app.close();
  });

  it('should list blobs', async () => {
    const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');

    const workspace = await createWorkspace(app, u1.token.token);
    const blobs = await listBlobs(app, u1.token.token, workspace.id);
    ok(blobs.length === 0, 'failed to list blobs');

    const buffer = Buffer.from([0, 0]);
    const hash = await setBlob(app, u1.token.token, workspace.id, buffer);

    const ret = await listBlobs(app, u1.token.token, workspace.id);
    ok(ret.length === 1, 'failed to list blobs');
    ok(ret[0] === hash, 'failed to list blobs');
    const server = app.getHttpServer();

    const token = u1.token.token;
    const response = await request(server)
      .get(`/api/workspaces/${workspace.id}/blobs/${hash}`)
      .auth(token, { type: 'bearer' })
      .buffer();

    deepEqual(response.body, buffer, 'failed to get blob');
  });
});
