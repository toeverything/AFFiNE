import { DebugLogger } from '@affine/debug';
import { mainApi } from '@affine/workspace/providers/indexeddb-worker/main-api';
import { AsyncCall } from 'async-call-rpc';
import { WorkerChannel } from 'async-call-rpc/utils/web/worker.js';

import type { WorkerAPI } from './worker-api';

const logger = new DebugLogger('affine:workspace:worker');
logger.info('init worker');

const channel = new WorkerChannel(
  new Worker(new URL('./main.worker', import.meta.url))
);

const worker = AsyncCall<WorkerAPI>(mainApi, {
  channel,
  log: true,
});

worker.add(1, 2).then(res => {
  logger.info('add', res);
});
