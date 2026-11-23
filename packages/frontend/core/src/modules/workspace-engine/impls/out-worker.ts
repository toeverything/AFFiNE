import { getWorkerUrl } from '@affine/env/worker';
import { OpClient } from '@toeverything/infra/op';

import type { WorkerOps } from './worker-ops';

let worker: OpClient<WorkerOps> | undefined;

export function getWorkspaceProfileWorker() {
  if (worker) {
    return worker;
  }

  const rawWorker = new Worker(getWorkerUrl('workspace-profile'));

  worker = new OpClient<WorkerOps>(rawWorker);
  return worker;
}
