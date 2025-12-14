import test from 'ava';
import { omit } from 'lodash-es';

import { createModule } from '../../../__tests__/create-module';
import { Mockers } from '../../../__tests__/mocks';
import { Models } from '../../../models';
import {
  parseDocToMarkdownFromDocSnapshot,
  readAllBlocksFromDocSnapshot,
  readAllDocIdsFromWorkspaceSnapshot,
} from '../blocksuite';

const module = await createModule({});
const models = module.get(Models);

const owner = await module.create(Mockers.User);
const workspace = await module.create(Mockers.Workspace, {
  snapshot: true,
  owner,
});

const docSnapshot = await module.create(Mockers.DocSnapshot, {
  workspaceId: workspace.id,
  user: owner,
});

test.after.always(async () => {
  await module.close();
});

test('can read all doc ids from workspace snapshot', async t => {
  const rootDoc = await models.doc.get(workspace.id, workspace.id);
  t.truthy(rootDoc);

  const docIds = readAllDocIdsFromWorkspaceSnapshot(rootDoc!.blob);

  t.deepEqual(docIds, ['5nS9BSp3Px']);
  t.snapshot(docIds);
});

test('can read all blocks from doc snapshot', async t => {
  const rootDoc = await models.doc.get(workspace.id, workspace.id);
  t.truthy(rootDoc);
  const doc = await models.doc.get(workspace.id, docSnapshot.id);
  t.truthy(doc);

  const result = await readAllBlocksFromDocSnapshot('doc-0', docSnapshot.blob);

  t.snapshot({
    ...result,
    blocks: result!.blocks.map(block => omit(block, ['yblock'])),
  });
});

test('can read blob filename from doc snapshot', async t => {
  const docSnapshot = await module.create(Mockers.DocSnapshot, {
    workspaceId: workspace.id,
    user: owner,
    snapshotFile: 'test-doc-with-blob.snapshot.bin',
  });

  const result = await readAllBlocksFromDocSnapshot('doc-0', docSnapshot.blob);

  // NOTE: avoid snapshot result directly, because it will cause hanging
  t.snapshot(JSON.parse(JSON.stringify(result)));
});

test('can read all blocks from doc snapshot without workspace snapshot', async t => {
  const doc = await models.doc.get(workspace.id, docSnapshot.id);
  t.truthy(doc);

  const result = await readAllBlocksFromDocSnapshot('doc-0', docSnapshot.blob);

  t.snapshot({
    ...result,
    blocks: result!.blocks.map(block => omit(block, ['yblock'])),
  });
});

test('can parse doc to markdown from doc snapshot', async t => {
  const result = parseDocToMarkdownFromDocSnapshot(
    docSnapshot.id,
    docSnapshot.blob
  );

  t.snapshot(result);
});

test('can parse doc to markdown from doc snapshot with ai editable', async t => {
  const result = parseDocToMarkdownFromDocSnapshot(
    docSnapshot.id,
    docSnapshot.blob,
    true
  );

  t.snapshot(result);
});
