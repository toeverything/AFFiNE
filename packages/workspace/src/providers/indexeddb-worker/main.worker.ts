import { AsyncCall } from 'async-call-rpc';
import { WorkerChannel } from 'async-call-rpc/utils/web/worker';

import type { MainAPI } from './main-api';
import { workerApi } from './worker-api';

AsyncCall<MainAPI>(workerApi, {
  channel: new WorkerChannel(),
});
