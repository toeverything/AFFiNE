import test from 'ava';

import { createModule } from '../../__tests__/create-module';
import { Mockers } from '../../__tests__/mocks';
import { Models } from '..';

const module = await createModule();
const models = module.get(Models);

test.after.always(async () => {
  await module.close();
});

test('should upsert blob', async t => {
  const workspace = await module.create(Mockers.Workspace);

  // add
  const blob = await models.blob.upsert({
    workspaceId: workspace.id,
    key: 'test-key',
    mime: 'text/plain',
    size: 100,
  });

  t.is(blob.workspaceId, workspace.id);
  t.is(blob.key, 'test-key');
  t.is(blob.mime, 'text/plain');
  t.is(blob.size, 100);
  t.is(blob.deletedAt, null);
  t.truthy(blob.createdAt);

  // update
  const blob2 = await models.blob.upsert({
    workspaceId: workspace.id,
    key: 'test-key',
    mime: 'text/html',
    size: 200,
  });

  t.is(blob2.workspaceId, workspace.id);
  t.is(blob2.key, 'test-key');
  t.is(blob2.mime, 'text/html');
  t.is(blob2.size, 200);
  t.is(blob2.deletedAt, null);

  // make sure only one blob is created
  const blobs = await models.blob.list(workspace.id);
  t.is(blobs.length, 1);
  t.deepEqual(blobs[0], blob2);
});

test('should delete blob', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const blob = await models.blob.upsert({
    workspaceId: workspace.id,
    key: 'test-key',
    mime: 'text/plain',
    size: 100,
  });

  await models.blob.delete(workspace.id, blob.key);

  const blob2 = await models.blob.get(workspace.id, blob.key);

  t.truthy(blob2);
  t.truthy(blob2?.deletedAt);
});

test('should delete blob permanently', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const blob = await models.blob.upsert({
    workspaceId: workspace.id,
    key: 'test-key',
    mime: 'text/plain',
    size: 100,
  });

  await models.blob.delete(workspace.id, blob.key, true);

  const blob2 = await models.blob.get(workspace.id, blob.key);
  t.is(blob2, null);
});

test('should list blobs', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const blob1 = await models.blob.upsert({
    workspaceId: workspace.id,
    key: 'test-key',
    mime: 'text/plain',
    size: 100,
  });

  const blob2 = await models.blob.upsert({
    workspaceId: workspace.id,
    key: 'test-key2',
    mime: 'text/plain',
    size: 200,
  });

  const blobs = await models.blob.list(workspace.id);

  t.is(blobs.length, 2);
  blobs.sort((a, b) => a.key.localeCompare(b.key));
  t.is(blobs[0].key, blob1.key);
  t.is(blobs[1].key, blob2.key);
});

test('should list deleted blobs', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const blob = await models.blob.upsert({
    workspaceId: workspace.id,
    key: 'test-key',
    mime: 'text/plain',
    size: 100,
  });

  await models.blob.delete(workspace.id, blob.key);

  const blobs = await models.blob.listDeleted(workspace.id);

  t.is(blobs.length, 1);
  t.is(blobs[0].key, blob.key);
  t.truthy(blobs[0].deletedAt);

  // delete permanently
  await models.blob.delete(workspace.id, blob.key, true);

  const blobs2 = await models.blob.listDeleted(workspace.id);

  t.is(blobs2.length, 0);
});

test('should get blob', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const blob = await models.blob.upsert({
    workspaceId: workspace.id,
    key: 'test-key',
    mime: 'text/plain',
    size: 100,
  });

  const blob2 = await models.blob.get(workspace.id, blob.key);

  t.truthy(blob2);
  t.is(blob2?.key, blob.key);
});

test('should total blob size in workspace', async t => {
  const workspace = await module.create(Mockers.Workspace);

  // default size is 0
  const size1 = await models.blob.totalSize(workspace.id);

  t.is(size1, 0);

  await models.blob.upsert({
    workspaceId: workspace.id,
    key: 'test-key',
    mime: 'text/plain',
    size: 100,
  });

  await models.blob.upsert({
    workspaceId: workspace.id,
    key: 'test-key2',
    mime: 'text/plain',
    size: 200,
  });

  const size2 = await models.blob.totalSize(workspace.id);

  t.is(size2, 300);
});
