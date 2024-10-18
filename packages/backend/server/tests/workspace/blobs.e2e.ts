import type { INestApplication } from '@nestjs/common';
import test from 'ava';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { FeatureManagementService, FeatureType } from '../../src/core/features';
import { QuotaService, QuotaType } from '../../src/core/quota';
import {
  collectAllBlobSizes,
  createTestingApp,
  createWorkspace,
  getWorkspaceBlobsSize,
  listBlobs,
  setBlob,
  signUp,
} from '../utils';

const OneMB = 1024 * 1024;

let app: INestApplication;
let quota: QuotaService;
let feature: FeatureManagementService;

test.beforeEach(async () => {
  const { app: testApp } = await createTestingApp({
    imports: [AppModule],
  });

  app = testApp;
  quota = app.get(QuotaService);
  feature = app.get(FeatureManagementService);
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
  // list blob result is not ordered
  t.deepEqual(ret.sort(), [hash1, hash2].sort());
});

test('should calc blobs size', async t => {
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);

  const buffer1 = Buffer.from([0, 0]);
  await setBlob(app, u1.token.token, workspace.id, buffer1);
  const buffer2 = Buffer.from([0, 1]);
  await setBlob(app, u1.token.token, workspace.id, buffer2);

  const size = await getWorkspaceBlobsSize(app, u1.token.token, workspace.id);
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
});

test('should reject blob exceeded limit', async t => {
  const u1 = await signUp(app, 'darksky', 'darksky@affine.pro', '1');

  const workspace1 = await createWorkspace(app, u1.token.token);
  await quota.switchUserQuota(u1.id, QuotaType.RestrictedPlanV1);

  const buffer1 = Buffer.from(Array.from({ length: OneMB + 1 }, () => 0));
  await t.throwsAsync(setBlob(app, u1.token.token, workspace1.id, buffer1));

  await quota.switchUserQuota(u1.id, QuotaType.FreePlanV1);

  const buffer2 = Buffer.from(Array.from({ length: OneMB + 1 }, () => 0));
  await t.notThrowsAsync(setBlob(app, u1.token.token, workspace1.id, buffer2));

  const buffer3 = Buffer.from(Array.from({ length: 100 * OneMB + 1 }, () => 0));
  await t.throwsAsync(setBlob(app, u1.token.token, workspace1.id, buffer3));
});

test('should reject blob exceeded quota', async t => {
  const u1 = await signUp(app, 'darksky', 'darksky@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);
  await quota.switchUserQuota(u1.id, QuotaType.RestrictedPlanV1);

  const buffer = Buffer.from(Array.from({ length: OneMB }, () => 0));

  for (let i = 0; i < 10; i++) {
    await t.notThrowsAsync(setBlob(app, u1.token.token, workspace.id, buffer));
  }

  await t.throwsAsync(setBlob(app, u1.token.token, workspace.id, buffer));
});

test('should accept blob even storage out of quota if workspace has unlimited feature', async t => {
  const u1 = await signUp(app, 'darksky', 'darksky@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);
  await quota.switchUserQuota(u1.id, QuotaType.RestrictedPlanV1);
  feature.addWorkspaceFeatures(workspace.id, FeatureType.UnlimitedWorkspace);

  const buffer = Buffer.from(Array.from({ length: OneMB }, () => 0));

  for (let i = 0; i < 10; i++) {
    await t.notThrowsAsync(setBlob(app, u1.token.token, workspace.id, buffer));
  }

  await t.notThrowsAsync(setBlob(app, u1.token.token, workspace.id, buffer));
});
