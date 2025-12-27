import { createHash } from 'node:crypto';

import test from 'ava';
import Sinon from 'sinon';

import { Config, StorageProviderFactory } from '../../base';
import { WorkspaceBlobStorage } from '../../core/storage/wrappers/blob';
import { BlobModel, WorkspaceFeatureModel } from '../../models';
import {
  collectAllBlobSizes,
  completeBlobUpload,
  createBlobUpload,
  createTestingApp,
  createWorkspace,
  deleteWorkspace,
  getBlobUploadPartUrl,
  getWorkspaceBlobsSize,
  listBlobs,
  setBlob,
  TestingApp,
} from '../utils';

const OneMB = 1024 * 1024;
const RESTRICTED_QUOTA = {
  seatQuota: 0,
  blobLimit: OneMB,
  storageQuota: 2 * OneMB - 1,
  historyPeriod: 1,
  memberLimit: 1,
};

let app: TestingApp;
let model: WorkspaceFeatureModel;

test.before(async () => {
  app = await createTestingApp();
  model = app.get(WorkspaceFeatureModel);
});

test.beforeEach(async () => {
  await app.initTestingDB();
});

test.after.always(async () => {
  await app.close();
});

test('should set blobs', async t => {
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);

  const buffer1 = Buffer.from([0, 0]);
  const hash1 = await setBlob(app, workspace.id, buffer1);
  const buffer2 = Buffer.from([0, 1]);
  const hash2 = await setBlob(app, workspace.id, buffer2);

  const response1 = await app
    .GET(`/api/workspaces/${workspace.id}/blobs/${hash1}`)
    .buffer();

  t.deepEqual(response1.body, buffer1, 'failed to get blob');

  const response2 = await app
    .GET(`/api/workspaces/${workspace.id}/blobs/${hash2}`)
    .buffer();

  t.deepEqual(response2.body, buffer2, 'failed to get blob');
});

test('should list blobs', async t => {
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);
  const blobs = await listBlobs(app, workspace.id);
  t.is(blobs.length, 0, 'failed to list blobs');

  const buffer1 = Buffer.from([0, 0]);
  const hash1 = await setBlob(app, workspace.id, buffer1);
  const buffer2 = Buffer.from([0, 1]);
  const hash2 = await setBlob(app, workspace.id, buffer2);

  const ret = await listBlobs(app, workspace.id);
  t.is(ret.length, 2, 'failed to list blobs');
  // list blob result is not ordered
  t.deepEqual(ret.map(x => x.key).sort(), [hash1, hash2].sort());
});

test('should create pending blob upload with graphql fallback', async t => {
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);
  const key = `upload-${Math.random().toString(16).slice(2, 8)}`;
  const size = 4;
  const mime = 'text/plain';

  const init = await createBlobUpload(app, workspace.id, key, size, mime);
  t.is(init.method, 'GRAPHQL');
  t.is(init.blobKey, key);

  const blobModel = app.get(BlobModel);
  const record = await blobModel.get(workspace.id, key);
  t.truthy(record);
  t.is(record?.status, 'pending');

  const listed = await listBlobs(app, workspace.id);
  t.is(listed.length, 0);
});

test('should complete pending blob upload', async t => {
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);
  const buffer = Buffer.from('done');
  const mime = 'text/plain';
  const key = sha256Base64urlWithPadding(buffer);

  await createBlobUpload(app, workspace.id, key, buffer.length, mime);

  const config = app.get(Config);
  const factory = app.get(StorageProviderFactory);
  const provider = factory.create(config.storages.blob.storage);

  await provider.put(`${workspace.id}/${key}`, buffer, {
    contentType: mime,
    contentLength: buffer.length,
  });

  const completed = await completeBlobUpload(app, workspace.id, key);
  t.is(completed, key);

  const blobModel = app.get(BlobModel);
  const record = await blobModel.get(workspace.id, key);
  t.truthy(record);
  t.is(record?.status, 'completed');

  const listed = await listBlobs(app, workspace.id);
  t.is(listed.length, 1);
});

test('should reject complete when blob key mismatched', async t => {
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);
  const buffer = Buffer.from('mismatch');
  const mime = 'text/plain';

  const wrongKey = sha256Base64urlWithPadding(Buffer.from('other'));
  await createBlobUpload(app, workspace.id, wrongKey, buffer.length, mime);

  const config = app.get(Config);
  const factory = app.get(StorageProviderFactory);
  const provider = factory.create(config.storages.blob.storage);

  await provider.put(`${workspace.id}/${wrongKey}`, buffer, {
    contentType: mime,
    contentLength: buffer.length,
  });

  await t.throwsAsync(() => completeBlobUpload(app, workspace.id, wrongKey), {
    message: 'Blob key mismatch',
  });
});

test('should reject multipart upload part url on fs provider', async t => {
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);

  await t.throwsAsync(
    () => getBlobUploadPartUrl(app, workspace.id, 'blob-key', 'upload', 1),
    {
      message: 'Multipart upload is not supported',
    }
  );
});

test('should auto delete blobs when workspace is deleted', async t => {
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);
  const buffer1 = Buffer.from([0, 0]);
  await setBlob(app, workspace.id, buffer1);
  const buffer2 = Buffer.from([0, 1]);
  await setBlob(app, workspace.id, buffer2);
  const size = await collectAllBlobSizes(app);
  t.is(size, 4);
  const blobs = await listBlobs(app, workspace.id);
  t.is(blobs.length, 2);

  const workspaceBlobStorage = Sinon.spy(app.get(WorkspaceBlobStorage));
  await deleteWorkspace(app, workspace.id);
  // should not emit workspace.blob.sync event
  t.is(workspaceBlobStorage.syncBlobMeta.callCount, 0);
});

test('should calc blobs size', async t => {
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);

  const buffer1 = Buffer.from([0, 0]);
  await setBlob(app, workspace.id, buffer1);
  const buffer2 = Buffer.from([0, 1]);
  await setBlob(app, workspace.id, buffer2);

  const size = await getWorkspaceBlobsSize(app, workspace.id);
  t.is(size, 4, 'failed to collect blob sizes');
});

test('should calc all blobs size', async t => {
  await app.signupV1('u1@affine.pro');

  const workspace1 = await createWorkspace(app);

  const buffer1 = Buffer.from([0, 0]);
  await setBlob(app, workspace1.id, buffer1);
  const buffer2 = Buffer.from([0, 1]);
  await setBlob(app, workspace1.id, buffer2);

  const workspace2 = await createWorkspace(app);

  const buffer3 = Buffer.from([0, 0]);
  await setBlob(app, workspace2.id, buffer3);
  const buffer4 = Buffer.from([0, 1]);
  await setBlob(app, workspace2.id, buffer4);

  const size = await collectAllBlobSizes(app);
  t.is(size, 8, 'failed to collect all blob sizes');
});

test('should reject blob exceeded limit', async t => {
  await app.signupV1('u1@affine.pro');

  const workspace1 = await createWorkspace(app);
  await model.add(workspace1.id, 'team_plan_v1', 'test', RESTRICTED_QUOTA);

  const buffer1 = Buffer.from(
    Array.from({ length: RESTRICTED_QUOTA.blobLimit + 1 }, () => 0)
  );
  await t.throwsAsync(setBlob(app, workspace1.id, buffer1), {
    message: 'You have exceeded your blob size quota.',
  });
});

test('should reject blob exceeded storage quota', async t => {
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);
  await model.add(workspace.id, 'team_plan_v1', 'test', RESTRICTED_QUOTA);

  const buffer = Buffer.from(Array.from({ length: OneMB }, () => 0));

  await t.notThrowsAsync(setBlob(app, workspace.id, buffer));
  await t.throwsAsync(setBlob(app, workspace.id, buffer), {
    message: 'You have exceeded your storage quota.',
  });
});

test('should accept blob even storage out of quota if workspace has unlimited feature', async t => {
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);
  await model.add(workspace.id, 'team_plan_v1', 'test', RESTRICTED_QUOTA);
  await model.add(workspace.id, 'unlimited_workspace', 'test');

  const buffer = Buffer.from(Array.from({ length: OneMB }, () => 0));
  await t.notThrowsAsync(setBlob(app, workspace.id, buffer));
  await t.notThrowsAsync(setBlob(app, workspace.id, buffer));
});

test('should throw error when blob size large than max file size', async t => {
  await app.signup();

  const workspace = await createWorkspace(app);

  const buffer = Buffer.from(new Uint8Array(1024 * 1024 * 11));
  await t.throwsAsync(setBlob(app, workspace.id, buffer), {
    message:
      'HTTP request error, message: File truncated as it exceeds the 10485760 byte size limit.',
  });
});

function sha256Base64urlWithPadding(buffer: Buffer) {
  return createHash('sha256')
    .update(buffer)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
