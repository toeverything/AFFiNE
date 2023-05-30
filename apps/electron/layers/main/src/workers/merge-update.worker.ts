import { parentPort, workerData } from 'node:worker_threads';

import * as Y from 'yjs';

function getMergeUpdate(updates: Uint8Array[]) {
  const yDoc = new Y.Doc();
  Y.transact(yDoc, () => {
    for (const update of updates) {
      Y.applyUpdate(yDoc, update);
    }
  });
  return Y.encodeStateAsUpdate(yDoc);
}

parentPort?.postMessage(getMergeUpdate(workerData));
