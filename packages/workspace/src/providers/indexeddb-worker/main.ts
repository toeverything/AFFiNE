import { mainApi } from '@affine/workspace/providers/indexeddb-worker/main-api';
import { AsyncCall } from 'async-call-rpc';
import { WorkerChannel } from 'async-call-rpc/utils/web/worker.js';

import type { WorkerAPI } from './worker-api';

const channel = new WorkerChannel(
  new Worker(new URL('./entry.worker', import.meta.url))
);

export const worker = AsyncCall<WorkerAPI>(mainApi, {
  channel,
  log: true,
});
