import { ServerRole } from '../../../env';
import { Queue, QUEUES } from './def';

export const WORKER_QUEUES = [Queue.DOC, Queue.BACKENDRUNTIME] as const;

export function queuesForRole(role: ServerRole | undefined): Queue[] {
  switch (role) {
    case ServerRole.AllInOne:
      return [...QUEUES];
    case ServerRole.Api:
      return QUEUES.filter(
        queue => !(WORKER_QUEUES as readonly Queue[]).includes(queue)
      );
    case ServerRole.Worker:
      return [...WORKER_QUEUES];
    case ServerRole.Frontend:
    case undefined:
      return [];
  }
}
