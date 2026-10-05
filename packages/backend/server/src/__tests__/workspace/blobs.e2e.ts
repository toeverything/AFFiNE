import { createHash, randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import ava from 'ava';
import Sinon from 'sinon';

import { CloudThrottlerGuard } from '../../base';
import { StorageRuntimeProvider } from '../../core/storage-runtime';
import { BlobModel } from '../../models';
import {
  collectAllBlobSizes,
  createTestingApp,
  createWorkspace,
  deleteWorkspace,
  getBlobUploadPartUrl,
  listBlobs,
  setBlob,
  TestingApp,
} from '../utils';

const test = ava.serial;

let app: TestingApp;
let tracker: Sinon.SinonStub;

test.before(async () => {
  app = await createTestingApp();
});

test.beforeEach(async () => {
  await app.initTestingDB();
  tracker = Sinon.stub(app.get(CloudThrottlerGuard), 'getTracker').resolves(
    `workspace-blobs:${randomUUID()}`
  );
});

test.afterEach.always(() => {
  tracker.restore();
});

test.after.always(async () => {
  await app.close();
});

test('should set and list blobs', async t => {
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);
  t.deepEqual(await listBlobs(app, workspace.id), []);

  const buffer1 = Buffer.from([0, 0]);
  const hash1 = await setBlob(app, workspace.id, buffer1);
  const buffer2 = Buffer.from([0, 1]);
  const hash2 = await setBlob(app, workspace.id, buffer2);

  t.is(hash1, sha256Base64urlWithPadding(buffer1).replace(/=+$/, ''));
  t.is(hash2, sha256Base64urlWithPadding(buffer2).replace(/=+$/, ''));

  const ret = await listBlobs(app, workspace.id);
  t.is(ret.length, 2);
  t.deepEqual(ret.map(x => x.key).sort(), [hash1, hash2].sort());
});

test('should keep partial blob metadata listing on DB path without storage scan', async t => {
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);
  const rt = app.get(StorageRuntimeProvider);

  const buffer1 = Buffer.from('with metadata');
  const buffer2 = Buffer.from('without metadata');
  const key1 = sha256Base64urlWithPadding(buffer1);
  const key2 = sha256Base64urlWithPadding(buffer2);
  await rt.putObject('blob', `${workspace.id}/${key1}`, buffer1, {
    contentType: 'text/plain',
    contentLength: buffer1.length,
  });
  await rt.putObject('blob', `${workspace.id}/${key2}`, buffer2, {
    contentType: 'text/plain',
    contentLength: buffer2.length,
  });

  await app.get(PrismaClient).blob.create({
    data: {
      workspaceId: workspace.id,
      key: key1,
      mime: 'text/plain',
      size: buffer1.length,
      status: 'completed',
      uploadId: null,
    },
  });

  const listed = await app.get(BlobModel).list(workspace.id);

  t.deepEqual(
    listed.map(blob => blob.key),
    [key1]
  );
});

test('should reject multipart upload part url on fs provider', async t => {
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);

  await t.throwsAsync(
    () =>
      getBlobUploadPartUrl(
        app,
        workspace.id,
        sha256Base64urlWithPadding(Buffer.from('blob-key')),
        'upload',
        1
      ),
    {
      message: 'Multipart upload is not supported',
    }
  );
});

test('workspace deletion remains authoritative when targeted object cleanup fails', async t => {
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);
  const rt = app.get(StorageRuntimeProvider);
  const key = await setBlob(app, workspace.id, Buffer.from('same-id-guard'));
  t.is(await rt.deleteWorkspaceObjects(workspace.id), 0);
  t.truthy(await rt.headObject('blob', `${workspace.id}/${key}`));
  const cleanupStub = Sinon.stub(rt, 'deleteWorkspaceObjects');
  cleanupStub.rejects(new Error('injected cleanup failure'));
  t.teardown(() => cleanupStub.restore());

  await deleteWorkspace(app, workspace.id);
  t.is(
    await app
      .get(PrismaClient)
      .workspace.findUnique({ where: { id: workspace.id } }),
    null
  );
  t.true(cleanupStub.calledOnce);
  t.is(cleanupStub.firstCall.args[0], workspace.id);
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

test('should throw error when blob size large than max file size', async t => {
  await app.signupV1('u1@affine.pro');

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
