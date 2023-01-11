import assert from 'assert';
import * as idb from 'lib0/indexeddb.js';
import { Workspace as BlocksuiteWorkspace } from '@blocksuite/store';

const { applyUpdate, encodeStateAsUpdate, mergeUpdates } =
  BlocksuiteWorkspace.Y;

export const writeUpdatesToLocal = async (
  blocksuiteWorkspace: BlocksuiteWorkspace
) => {
  const workspaceId = blocksuiteWorkspace.room;
  assert(workspaceId);
  await idb.deleteDB(workspaceId);
  const db = await idb.openDB(workspaceId, db =>
    idb.createStores(db, [['updates', { autoIncrement: true }], ['custom']])
  );
  const currState = encodeStateAsUpdate(blocksuiteWorkspace.doc);
  const [updatesStore] = idb.transact(db, ['updates']); // , 'readonly')

  if (updatesStore) {
    await idb.addAutoKey(updatesStore, currState);
  }
};

export const applyLocalUpdates = async (
  blocksuiteWorkspace: BlocksuiteWorkspace
) => {
  const workspaceId = blocksuiteWorkspace.room;
  assert(workspaceId, 'Blocksuite workspace without room(workspaceId).');
  const db = await idb.openDB(workspaceId, db =>
    idb.createStores(db, [['updates', { autoIncrement: true }], ['custom']])
  );

  const [updatesStore] = idb.transact(db, ['updates']); // , 'readonly')
  if (updatesStore) {
    const updates = await idb.getAll(updatesStore);
    const doc = blocksuiteWorkspace.doc;
    await new Promise(resolve => {
      const mergedUpdates = mergeUpdates(updates);
      doc.once('update', resolve);
      applyUpdate(doc, mergedUpdates);
    });
  }
  return blocksuiteWorkspace;
};
