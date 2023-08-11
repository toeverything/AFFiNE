import { applyUpdate, Doc as YDoc, encodeStateAsUpdate, transact } from 'yjs';

export function mergeUpdate(updates: Uint8Array[]) {
  const yDoc = new YDoc();
  transact(yDoc, () => {
    for (const update of updates) {
      applyUpdate(yDoc, update);
    }
  });
  return encodeStateAsUpdate(yDoc);
}
