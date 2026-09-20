import test from 'ava';
import * as Y from 'yjs';

import { createModule } from '../../../__tests__/create-module';
import { Mockers } from '../../../__tests__/mocks';
import { Models } from '../../../models';
import {
  parseDocToMarkdownFromDocSnapshot,
  projectDocCanvas,
  projectDocSearch,
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

test('merged root updates retain trash and exclude permanently removed docs', async t => {
  const rootDoc = await models.doc.get(workspace.id, workspace.id);
  t.truthy(rootDoc);

  const root = new Y.Doc();
  Y.applyUpdate(root, rootDoc!.blob);
  const pending = new Y.Doc();
  Y.applyUpdate(pending, Y.encodeStateAsUpdate(root));
  const trashMeta = new Y.Map<unknown>();
  trashMeta.set('id', 'trash-doc');
  trashMeta.set('title', 'Trash');
  trashMeta.set('trash', true);
  (pending.getMap('meta').get('pages') as Y.Array<Y.Map<unknown>>).push([
    trashMeta,
  ]);
  const pendingUpdate = Y.encodeStateAsUpdate(
    pending,
    Y.encodeStateVector(root)
  );
  const merged = Y.mergeUpdates([rootDoc!.blob, pendingUpdate]);

  t.false(readAllDocIdsFromWorkspaceSnapshot(merged).includes('trash-doc'));
  t.true(
    readAllDocIdsFromWorkspaceSnapshot(merged, true).includes('trash-doc')
  );

  const removed = new Y.Doc();
  Y.applyUpdate(removed, merged);
  const pages = removed.getMap('meta').get('pages') as Y.Array<Y.Map<unknown>>;
  const target = pages
    .toArray()
    .findIndex(meta => meta instanceof Y.Map && meta.get('id') === 'trash-doc');
  pages.delete(target, 1);
  t.false(
    readAllDocIdsFromWorkspaceSnapshot(
      Y.encodeStateAsUpdate(removed),
      true
    ).includes('trash-doc')
  );
});

test('nested concurrent meta edits do not restore a deleted entry', t => {
  const initial = new Y.Doc();
  const pages = new Y.Array<Y.Map<unknown>>();
  const meta = new Y.Map<unknown>();
  meta.set('id', 'doc-1');
  meta.set('title', 'Initial');
  pages.push([meta]);
  initial.getMap('meta').set('pages', pages);
  const state = Y.encodeStateAsUpdate(initial);

  const deletingClient = new Y.Doc();
  const editingClient = new Y.Doc();
  Y.applyUpdate(deletingClient, state);
  Y.applyUpdate(editingClient, state);
  (
    deletingClient.getMap('meta').get('pages') as Y.Array<Y.Map<unknown>>
  ).delete(0, 1);
  (editingClient.getMap('meta').get('pages') as Y.Array<Y.Map<unknown>>)
    .get(0)
    .set('title', 'Offline edit');

  const merged = new Y.Doc();
  Y.applyUpdate(merged, Y.encodeStateAsUpdate(deletingClient));
  Y.applyUpdate(merged, Y.encodeStateAsUpdate(editingClient));
  t.is(
    (merged.getMap('meta').get('pages') as Y.Array<Y.Map<unknown>>).length,
    0
  );

  (editingClient.getMap('meta').get('pages') as Y.Array<Y.Map<unknown>>).push([
    meta.clone(),
  ]);
  Y.applyUpdate(merged, Y.encodeStateAsUpdate(editingClient));
  t.is(
    (merged.getMap('meta').get('pages') as Y.Array<Y.Map<unknown>>).length,
    1
  );
});

test('can parse doc to markdown from doc snapshot', async t => {
  const result = parseDocToMarkdownFromDocSnapshot(
    workspace.id,
    docSnapshot.id,
    docSnapshot.blob
  );

  t.snapshot(result);

  const canvas = projectDocCanvas(
    docSnapshot.blob,
    'fixture-doc',
    'fixture-revision'
  );
  const search = projectDocSearch(
    docSnapshot.blob,
    'fixture-doc',
    'fixture-revision'
  );
  t.snapshot(canvas, 'should export the exact canvas projection');
  t.snapshot(search, 'should export the exact search projection');
  t.deepEqual(
    search,
    projectDocSearch(docSnapshot.blob, 'fixture-doc', 'fixture-revision')
  );

  const blobSnapshot = await module.create(Mockers.DocSnapshot, {
    workspaceId: workspace.id,
    user: owner,
    docId: 'fixture-blob-doc',
    snapshotFile: 'test-doc-with-blob.snapshot.bin',
  });
  t.snapshot(
    projectDocSearch(
      blobSnapshot.blob,
      blobSnapshot.id,
      'fixture-blob-revision'
    ),
    'should export attachment metadata from the blob fixture'
  );
});

test('can parse doc to markdown from doc snapshot with ai editable', async t => {
  const result = parseDocToMarkdownFromDocSnapshot(
    workspace.id,
    docSnapshot.id,
    docSnapshot.blob,
    true
  );

  t.snapshot(result);
});
