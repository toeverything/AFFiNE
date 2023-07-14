import { AsyncCall } from 'async-call-rpc';
import { WorkerChannel } from 'async-call-rpc/utils/web/worker';

import type { WorkerMethods } from './worker';

export function createWorkerSync() {
  return AsyncCall<WorkerMethods>(
    {},
    {
      channel: new WorkerChannel(
        new Worker(new URL('./worker.ts', import.meta.url))
      ),
    }
  );
}
