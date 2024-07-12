import { DebugLogger } from '@affine/debug';
import { MANUALLY_STOP, throwIfAborted } from '@toeverything/infra';

import type {
  WorkerIngoingMessage,
  WorkerInput,
  WorkerOutgoingMessage,
  WorkerOutput,
} from './types';

const logger = new DebugLogger('affine:indexer-worker');

export async function createWorker(abort: AbortSignal) {
  let worker: Worker | null = null;
  while (throwIfAborted(abort)) {
    try {
      worker = await new Promise<Worker>((resolve, reject) => {
        // @TODO(@forehalo): need to make a general worker
        const worker = new Worker(
          /* webpackChunkName: "worker" */ new URL(
            './in-worker.ts',
            import.meta.url
          )
        );
        worker.addEventListener('error', reject);
        worker.addEventListener('message', event => {
          if (event.data.type === 'init') {
            resolve(worker);
          }
        });
        worker.postMessage({ type: 'init', msgId: 0 } as WorkerIngoingMessage);
        setTimeout(() => {
          reject('timeout');
        }, 1000 * 30 /* 30 sec */);
      });
    } catch (err) {
      logger.debug(
        `Indexer worker init failed, ${err}, will retry in 5 seconds.`
      );
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    if (worker) {
      break;
    }
  }

  if (!worker) {
    // never reach here
    throw new Error('Worker is not created');
  }

  const terminateAbort = new AbortController();

  let msgId = 1;

  return {
    run: async (input: WorkerInput) => {
      const dispose: (() => void)[] = [];
      return new Promise<WorkerOutput>((resolve, reject) => {
        const currentMsgId = msgId++;
        const msgHandler = (event: MessageEvent<WorkerOutgoingMessage>) => {
          if (event.data.msgId === currentMsgId) {
            if (event.data.type === 'done') {
              resolve(event.data.output);
            } else if (event.data.type === 'failed') {
              reject(new Error(event.data.error));
            } else {
              reject(new Error('Unknown message type'));
            }
          }
        };
        const abortHandler = (reason: any) => {
          reject(reason);
        };

        worker.addEventListener('message', msgHandler);
        dispose.push(() => {
          worker?.removeEventListener('message', msgHandler);
        });

        terminateAbort.signal.addEventListener('abort', abortHandler);
        dispose.push(() => {
          terminateAbort.signal.removeEventListener('abort', abortHandler);
        });

        worker.postMessage({
          type: 'run',
          msgId: currentMsgId,
          input,
        } as WorkerIngoingMessage);
      }).finally(() => {
        for (const d of dispose) {
          d();
        }
      });
    },
    dispose: () => {
      worker.terminate();
      terminateAbort.abort(MANUALLY_STOP);
    },
  };
}

export type IndexerWorker = Awaited<ReturnType<typeof createWorker>>;
