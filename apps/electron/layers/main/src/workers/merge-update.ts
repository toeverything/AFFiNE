import path from 'node:path';
import { Worker } from 'node:worker_threads';

export async function mergeUpdate(updates: Uint8Array[]) {
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
