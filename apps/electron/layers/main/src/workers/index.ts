import path from 'node:path';
import { Worker } from 'node:worker_threads';

import { mergeUpdate } from './merge-update';

export function mergeUpdateWorker(updates: Uint8Array[]) {
  // fallback to main thread if worker is disabled (in vitest)
  if (process.env.USE_WORKER !== 'true') {
    return mergeUpdate(updates);
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    // it is intended to have "./workers" in the path
    const workerFile = path.join(__dirname, './workers/merge-update.worker.js');

    // convert updates to SharedArrayBuffer[s]
    const sharedArrayBufferUpdates = updates.map(update => {
      const buffer = new SharedArrayBuffer(update.byteLength);
      const view = new Uint8Array(buffer);
      view.set(update);
      return view;
    });

    const worker = new Worker(workerFile, {
      workerData: sharedArrayBufferUpdates,
    });

    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', code => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}
