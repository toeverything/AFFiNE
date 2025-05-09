import type { NamespaceHandlers } from '../type';
import { WorkerManager } from './pool';

export const workerHandlers = {
  connectWorker: async (e, key: string, portId: string) => {
    const { portForRenderer } = await WorkerManager.instance.connectWorker(
      key,
      portId,
      e.sender
    );
    e.sender.postMessage('worker-connect', { portId }, [portForRenderer]);
    return {
      portId: portId,
    };
  },
  disconnectWorker: async (_, key: string, portId: string) => {
    WorkerManager.instance.disconnectWorker(key, portId);
  },
} satisfies NamespaceHandlers;
