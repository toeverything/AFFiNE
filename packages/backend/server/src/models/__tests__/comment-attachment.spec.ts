import test from 'ava';

import { createModule } from '../../__tests__/create-module';
import { Mockers } from '../../__tests__/mocks';
import { Models } from '..';

const module = await createModule();
const models = module.get(Models);

test.after.always(async () => {
  await module.close();
});

test('should upsert comment attachment', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const user = await module.create(Mockers.User);

  // add
  const item = await models.commentAttachment.upsert({
    workspaceId: workspace.id,
    docId: 'test-doc-id',
    key: 'test-key',
    name: 'test-name',
    mime: 'text/plain',
    size: 100,
    createdBy: user.id,
  });

  t.is(item.workspaceId, workspace.id);
  t.is(item.docId, 'test-doc-id');
  t.is(item.key, 'test-key');
  t.is(item.mime, 'text/plain');
  t.is(item.size, 100);
  t.truthy(item.createdAt);
  t.is(item.createdBy, user.id);

  // update
  const item2 = await models.commentAttachment.upsert({
    workspaceId: workspace.id,
    docId: 'test-doc-id',
    name: 'test-name',
    key: 'test-key',
    mime: 'text/html',
    size: 200,
  });

  t.is(item2.workspaceId, workspace.id);
  t.is(item2.docId, 'test-doc-id');
  t.is(item2.key, 'test-key');
  t.is(item2.mime, 'text/html');
  t.is(item2.size, 200);
  t.is(item2.createdBy, user.id);

  // make sure only one blob is created
  const items = await models.commentAttachment.list(workspace.id);
  t.is(items.length, 1);
  t.deepEqual(items[0], item2);
});

test('should delete comment attachment', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const item = await models.commentAttachment.upsert({
    workspaceId: workspace.id,
    docId: 'test-doc-id',
    key: 'test-key',
    name: 'test-name',
    mime: 'text/plain',
    size: 100,
  });

  await models.commentAttachment.delete(workspace.id, item.docId, item.key);

  const item2 = await models.commentAttachment.get(
    workspace.id,
    item.docId,
    item.key
  );

  t.is(item2, null);
});

test('should list comment attachments', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const item1 = await models.commentAttachment.upsert({
    workspaceId: workspace.id,
    docId: 'test-doc-id',
    name: 'test-name',
    key: 'test-key',
    mime: 'text/plain',
    size: 100,
  });

  const item2 = await models.commentAttachment.upsert({
    workspaceId: workspace.id,
    docId: 'test-doc-id2',
    name: 'test-name2',
    key: 'test-key2',
    mime: 'text/plain',
    size: 200,
  });

  const items = await models.commentAttachment.list(workspace.id);

  t.is(items.length, 2);
  items.sort((a, b) => a.key.localeCompare(b.key));
  t.is(items[0].key, item1.key);
  t.is(items[1].key, item2.key);
});

test('should get comment attachment', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const item = await models.commentAttachment.upsert({
    workspaceId: workspace.id,
    docId: 'test-doc-id',
    name: 'test-name',
    key: 'test-key',
    mime: 'text/plain',
    size: 100,
  });

  const item2 = await models.commentAttachment.get(
    workspace.id,
    item.docId,
    item.key
  );

  t.truthy(item2);
  t.is(item2?.key, item.key);
});
