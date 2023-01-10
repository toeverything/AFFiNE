import assert from 'assert';
import * as idb from 'lib0/indexeddb.js';
import { Workspace as BlocksuiteWorkspace } from '@blocksuite/store';

const { encodeStateAsUpdate } = BlocksuiteWorkspace.Y;

export const initStore = async (blocksuiteWorkspace: BlocksuiteWorkspace) => {
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
