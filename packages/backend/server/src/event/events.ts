import type { Snapshot, Workspace } from '@prisma/client';

import { Flatten, Payload } from './types';

interface EventDefinitions {
  workspace: {
    deleted: Payload<Workspace['id']>;
  };

  snapshot: {
    updated: Payload<
      Pick<Snapshot, 'id' | 'workspaceId'> & {
        previous: Pick<Snapshot, 'blob' | 'state' | 'updatedAt'>;
      }
    >;
    deleted: Payload<Pick<Snapshot, 'id' | 'workspaceId'>>;
  };
}

export type EventKV = Flatten<EventDefinitions>;

export type Event = keyof EventKV;
export type EventPayload<E extends Event> = EventKV[E];
