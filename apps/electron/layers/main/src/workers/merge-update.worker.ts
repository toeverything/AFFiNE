import { parentPort, workerData } from 'node:worker_threads';

import { mergeUpdate } from './merge-update';

function getMergeUpdate(updates: Uint8Array[]) {
  const update = mergeUpdate(updates);
  const buffer = new SharedArrayBuffer(update.byteLength);
  const view = new Uint8Array(buffer);
  view.set(update);

  return update;
}

parentPort?.postMessage(getMergeUpdate(workerData));
