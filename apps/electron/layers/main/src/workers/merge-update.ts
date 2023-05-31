import * as Y from 'yjs';

export function mergeUpdate(updates: Uint8Array[]) {
  const yDoc = new Y.Doc();
  Y.transact(yDoc, () => {
    for (const update of updates) {
      Y.applyUpdate(yDoc, update);
    }
  });
  return Y.encodeStateAsUpdate(yDoc);
}
