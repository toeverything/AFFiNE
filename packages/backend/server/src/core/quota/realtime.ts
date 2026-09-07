import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { z } from 'zod';

import { SpaceAccessDenied } from '../../base';
import { BackendRuntimeProvider } from '../backend-runtime';
import { registerRealtimeLiveQuery } from '../realtime/provider';
import { RealtimeRegistry } from '../realtime/registry';
import {
  realtimeUserQuotaStateRoom,
  realtimeWorkspaceQuotaStateRoom,
} from '../realtime/rooms';

declare module '@affine/realtime' {
  interface RealtimeRequestMap {
    'user.quota-state.get': {
      input: Record<string, never>;
      output: {
        state: import('@affine/realtime').UserQuotaStateSnapshot;
      };
    };
    'workspace.quota-state.get': {
      input: { workspaceId: string };
      output: {
        state: import('@affine/realtime').WorkspaceQuotaStateSnapshot;
      };
    };
  }

  interface RealtimeTopicMap {
    'user.quota-state.changed': {
      input: Record<string, never>;
      event: { changed: true };
    };
    'workspace.quota-state.changed': {
      input: { workspaceId: string };
      event: { changed: true };
    };
  }
}

@Injectable()
export class QuotaStateRealtimeProvider implements OnModuleInit {
  constructor(
    private readonly runtime: BackendRuntimeProvider,
    @Optional() private readonly registry?: RealtimeRegistry
  ) {}

  onModuleInit() {
    const { registry } = this;
    if (!registry) return;

    const workspaceInput = z.object({ workspaceId: z.string() });

    registerRealtimeLiveQuery(registry, {
      request: {
        name: 'user.quota-state.get',
        input: z.object({}),
        handle: async user => ({
          state: await this.runtime.getUserQuotaStateV1(user.id),
        }),
      },
      topic: {
        name: 'user.quota-state.changed',
        input: z.object({}),
        authorize: async () => {},
        room: user => {
          if (!user) {
            throw new Error('Authenticated user is required');
          }
          return realtimeUserQuotaStateRoom(user.id);
        },
      },
    });

    registerRealtimeLiveQuery(registry, {
      request: {
        name: 'workspace.quota-state.get',
        input: workspaceInput,
        handle: async (user, payload) => {
          await this.assertWorkspace(user.id, payload.workspaceId);
          return {
            state: await this.runtime.getWorkspaceQuotaStateV1(
              payload.workspaceId
            ),
          };
        },
      },
      topic: {
        name: 'workspace.quota-state.changed',
        input: workspaceInput,
        authorize: async (user, payload) => {
          await this.assertWorkspace(user.id, payload.workspaceId);
        },
        room: (_user, payload) =>
          realtimeWorkspaceQuotaStateRoom(payload.workspaceId),
      },
    });
  }

  private async assertWorkspace(userId: string, workspaceId: string) {
    const authorization = await this.runtime.authorizePermissionV1({
      version: 1,
      workspaceId,
      actorUserId: userId,
      workspaceActions: ['Workspace.Read'],
      docs: [],
    });
    if (!authorization.workspace.decisions[0]?.allowed) {
      throw new SpaceAccessDenied({ spaceId: workspaceId });
    }
  }
}
