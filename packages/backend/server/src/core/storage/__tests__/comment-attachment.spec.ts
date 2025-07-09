import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import test from 'ava';

import { createModule } from '../../../__tests__/create-module';
import { Mockers } from '../../../__tests__/mocks';
import { Models } from '../../../models';
import { CommentAttachmentStorage, StorageModule } from '..';

const module = await createModule({
  imports: [StorageModule],
});
const storage = module.get(CommentAttachmentStorage);
const models = module.get(Models);

test.before(async () => {
  await storage.onConfigInit();
});

test.after.always(async () => {
  await module.close();
});

test('should put comment attachment', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const user = await module.create(Mockers.User);
  const docId = randomUUID();
  const key = randomUUID();
  const blob = Buffer.from('test');

  await storage.put(workspace.id, docId, key, 'test.txt', blob, user.id);

  const item = await models.commentAttachment.get(workspace.id, docId, key);

  t.truthy(item);
  t.is(item?.workspaceId, workspace.id);
  t.is(item?.docId, docId);
  t.is(item?.key, key);
  t.is(item?.mime, 'text/plain');
  t.is(item?.size, blob.length);
  t.is(item?.name, 'test.txt');
  t.is(item?.createdBy, user.id);
});

test('should get comment attachment', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const user = await module.create(Mockers.User);
  const docId = randomUUID();
  const key = randomUUID();
  const blob = Buffer.from('test');

  await storage.put(workspace.id, docId, key, 'test.txt', blob, user.id);

  const item = await storage.get(workspace.id, docId, key);

  t.truthy(item);
  t.is(item?.metadata?.contentType, 'text/plain');
  t.is(item?.metadata?.contentLength, blob.length);
  // body is readable stream
  t.truthy(item?.body);
  const bytes = await readableToBytes(item?.body as Readable);
  t.is(bytes.toString(), 'test');
});

test('should get comment attachment with access url', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const user = await module.create(Mockers.User);
  const docId = randomUUID();
  const key = randomUUID();
  const blob = Buffer.from('test');

  await storage.put(workspace.id, docId, key, 'test.txt', blob, user.id);

  const url = storage.getUrl(workspace.id, docId, key);

  t.truthy(url);
  t.is(
    url,
    `http://localhost:3010/api/workspaces/${workspace.id}/docs/${docId}/comment-attachments/${key}`
  );
});

test('should delete comment attachment', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const user = await module.create(Mockers.User);
  const docId = randomUUID();
  const key = randomUUID();
  const blob = Buffer.from('test');

  await storage.put(workspace.id, docId, key, 'test.txt', blob, user.id);

  await storage.delete(workspace.id, docId, key);

  const item = await models.commentAttachment.get(workspace.id, docId, key);

  t.is(item, null);
});

test('should handle comment.attachment.delete event', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const user = await module.create(Mockers.User);
  const docId = randomUUID();
  const key = randomUUID();
  const blob = Buffer.from('test');

  await storage.put(workspace.id, docId, key, 'test.txt', blob, user.id);

  await storage.onCommentAttachmentDelete({
    workspaceId: workspace.id,
    docId,
    key,
  });

  const item = await models.commentAttachment.get(workspace.id, docId, key);

  t.is(item, null);
});

test('should handle workspace.deleted event', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const user = await module.create(Mockers.User);
  const docId = randomUUID();
  const key1 = randomUUID();
  const key2 = randomUUID();
  const blob1 = Buffer.from('test');
  const blob2 = Buffer.from('test2');

  await storage.put(workspace.id, docId, key1, 'test.txt', blob1, user.id);
  await storage.put(workspace.id, docId, key2, 'test.txt', blob2, user.id);

  const count = module.event.count('comment.attachment.delete');

  await storage.onWorkspaceDeleted({
    id: workspace.id,
  });

  t.is(module.event.count('comment.attachment.delete'), count + 2);
});

async function readableToBytes(stream: Readable) {
  const chunks: Buffer[] = [];
  let chunk: Buffer;
  for await (chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
