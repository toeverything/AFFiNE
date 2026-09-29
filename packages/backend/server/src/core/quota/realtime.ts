import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { z } from 'zod';

import { OnEvent, SpaceAccessDenied } from '../../base';
import { BackendRuntimeProvider } from '../backend-runtime';
import type { RuntimeInvalidation } from '../backend-runtime/provider';
import { registerRealtimeLiveQuery } from '../realtime/provider';
import { RealtimePublisher } from '../realtime/publisher';
import { RealtimeRegistry } from '../realtime/registry';
import {
  realtimeUserQuotaStateRoom,
  realtimeWorkspaceQuotaStateRoom,
} from '../realtime/rooms';

@Injectable()
export class QuotaStateRealtimeProvider implements OnModuleInit {
  constructor(
    private readonly runtime: BackendRuntimeProvider,
    @Optional() private readonly registry?: RealtimeRegistry,
    @Optional() private readonly publisher?: RealtimePublisher
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

  @OnEvent('backendRuntime.invalidation', { suppressError: true })
  onRuntimeInvalidation(invalidation: RuntimeInvalidation) {
    if (
      invalidation.kind === 'quotaEntitlement' ||
      invalidation.kind === 'quotaStorageUsage'
    ) {
      const [type, id] = invalidation.subject.split(':', 2);
      if (!id) return;
      if (type === 'user') {
        this.publisher?.publishChanged(
          'user.quota-state.changed',
          {},
          'runtime-invalidation',
          { room: realtimeUserQuotaStateRoom(id) }
        );
      } else if (type === 'workspace') {
        this.publishWorkspace(id);
      }
      return;
    }
    if (
      invalidation.kind === 'quotaOwnerMapping' ||
      invalidation.kind === 'quotaSeatUsage'
    ) {
      this.publishWorkspace(invalidation.workspaceId);
    }
  }

  private publishWorkspace(workspaceId: string) {
    this.publisher?.publishChanged(
      'workspace.quota-state.changed',
      { workspaceId },
      'runtime-invalidation',
      { room: realtimeWorkspaceQuotaStateRoom(workspaceId) }
    );
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
