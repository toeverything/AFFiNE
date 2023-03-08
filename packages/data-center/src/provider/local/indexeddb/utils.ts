import { Workspace as BlocksuiteWorkspace } from '@blocksuite/store';
import assert from 'assert';
import * as idb from 'lib0/indexeddb';

import { applyUpdate } from '../../../utils';

const { encodeStateAsUpdate, mergeUpdates } = BlocksuiteWorkspace.Y;

export const writeUpdatesToLocal = async (
  blocksuiteWorkspace: BlocksuiteWorkspace
) => {
  const workspaceId = blocksuiteWorkspace.id;
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
  db.close();
};

export const applyLocalUpdates = async (
  blocksuiteWorkspace: BlocksuiteWorkspace
) => {
  const workspaceId = blocksuiteWorkspace.id;
  assert(workspaceId, 'Blocksuite workspace without room(workspaceId).');
  const db = await idb.openDB(workspaceId, db =>
    idb.createStores(db, [['updates', { autoIncrement: true }], ['custom']])
  );

  const [updatesStore] = idb.transact(db, ['updates']); // , 'readonly')
  if (updatesStore) {
    const updates = await idb.getAll(updatesStore);
    const mergedUpdates = mergeUpdates(updates);
    await applyUpdate(blocksuiteWorkspace, mergedUpdates);
  }
  return blocksuiteWorkspace;
};
