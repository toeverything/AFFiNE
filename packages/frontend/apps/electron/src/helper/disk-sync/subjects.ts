import type { DiskSyncEvent } from '@affine/nbstore/disk';
import { Subject } from 'rxjs';

export interface DiskSyncSessionEvent {
  sessionId: string;
  event: DiskSyncEvent;
}

export const diskSyncSubjects = {
  event$: new Subject<DiskSyncSessionEvent>(),
};
