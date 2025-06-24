import { applyUpdate, Doc as YDoc, encodeStateAsUpdate, transact } from 'yjs';

export function mergeUpdate(updates: Uint8Array[]) {
  if (updates.length === 0) {
    return new Uint8Array();
  }
  if (updates.length === 1) {
    return updates[0];
  }
  const yDoc = new YDoc();
  transact(yDoc, () => {
    for (const update of updates) {
      applyUpdate(yDoc, update);
    }
  });
  return encodeStateAsUpdate(yDoc);
}
