import path from 'node:path';
import { Worker } from 'node:worker_threads';

export async function mergeUpdate(updates: Uint8Array[]) {
  if (typeof import.meta !== 'undefined') {
    // import.meta is not available in Electron, so we believe this is running
    // in vitest. In this case, we will NOT use worker
    const Y = await import('yjs');

    const yDoc = new Y.Doc();
    Y.transact(yDoc, () => {
      for (const update of updates) {
        Y.applyUpdate(yDoc, update);
      }
    });
    return Y.encodeStateAsUpdate(yDoc);
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    const workerFile = path.join(__dirname, './workers/merge-update.worker.js');
    const worker = new Worker(workerFile, {
      workerData: updates,
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
