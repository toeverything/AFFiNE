import type { Snapshot, User, Workspace } from '@prisma/client';

import { Flatten, Payload } from './types';

interface EventDefinitions {
  workspace: {
    deleted: Payload<Workspace['id']>;
    blob: {
      deleted: Payload<{
        workspaceId: Workspace['id'];
        name: string;
      }>;
    };
  };

  snapshot: {
    updated: Payload<
      Pick<Snapshot, 'id' | 'workspaceId'> & {
        previous: Pick<Snapshot, 'blob' | 'state' | 'updatedAt'>;
      }
    >;
    deleted: Payload<Pick<Snapshot, 'id' | 'workspaceId'>>;
  };

  user: {
    deleted: Payload<User>;
  };
}

export type EventKV = Flatten<EventDefinitions>;

export type Event = keyof EventKV;
export type EventPayload<E extends Event> = EventKV[E];
