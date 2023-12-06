import type { Snapshot, User, Workspace } from '@prisma/client';

import { ChangePayload, Flatten, Payload } from './types';

interface EventDefinitions {
  user: {
    created: Payload<User>;
    updated: Payload<ChangePayload<User>>;
    deleted: Payload<User['id']>;
  };

  workspace: {
    created: Payload<Workspace>;
    updated: Payload<ChangePayload<Workspace>>;
    deleted: Payload<Workspace['id']>;
  };

  snapshot: {
    created: Payload<Snapshot>;
    updated: Payload<ChangePayload<Snapshot>>;
    deleted: Payload<Pick<Snapshot, 'id' | 'workspaceId'>>;
  };
}

export type EventKV = Flatten<EventDefinitions>;

export type Event = keyof EventKV;
export type EventPayload<E extends Event> = EventKV[E];
