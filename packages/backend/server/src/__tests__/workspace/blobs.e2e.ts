import test from 'ava';
import Sinon from 'sinon';

import { WorkspaceBlobStorage } from '../../core/storage/wrappers/blob';
import { WorkspaceFeatureModel } from '../../models';
import {
  collectAllBlobSizes,
  createTestingApp,
  createWorkspace,
  deleteWorkspace,
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
