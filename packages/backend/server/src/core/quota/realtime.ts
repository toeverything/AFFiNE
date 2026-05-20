import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { z } from 'zod';

import { OnEvent, SpaceAccessDenied } from '../../base';
import { Models } from '../../models';
import { registerRealtimeLiveQuery } from '../realtime/provider';
import { RealtimePublisher } from '../realtime/publisher';
import { RealtimeRegistry } from '../realtime/registry';
import {
  realtimeUserQuotaStateRoom,
  realtimeWorkspaceQuotaStateRoom,
} from '../realtime/rooms';
import { QuotaStateService } from './state';

type UserQuotaStateSnapshot = import('@affine/realtime').UserQuotaStateSnapshot;
type WorkspaceQuotaStateSnapshot =
  import('@affine/realtime').WorkspaceQuotaStateSnapshot;

declare module '@affine/realtime' {
  interface RealtimeRequestMap {
    'user.quota-state.get': {
      input: Record<string, never>;
      output: { state: UserQuotaStateSnapshot };
    };
    'workspace.quota-state.get': {
      input: { workspaceId: string };
      output: { state: WorkspaceQuotaStateSnapshot };
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
    private readonly models: Models,
    private readonly quotaState: QuotaStateService,
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
          state: this.serializeState(
            await this.quotaState.reconcileUserQuotaState(user.id)
          ) as unknown as UserQuotaStateSnapshot,
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
            state: this.serializeState(
              await this.quotaState.reconcileWorkspaceQuotaState(
                payload.workspaceId
              )
            ) as unknown as WorkspaceQuotaStateSnapshot,
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

  @OnEvent('user.quota_state.changed', { suppressError: true })
  async onUserQuotaStateChanged({
    userId,
  }: Events['user.quota_state.changed']) {
    this.publisher?.publish(
      'user.quota-state.changed',
      {},
      { changed: true },
      { room: realtimeUserQuotaStateRoom(userId) }
    );
  }

  @OnEvent('workspace.quota_state.changed', { suppressError: true })
  async onWorkspaceQuotaStateChanged({
    workspaceId,
  }: Events['workspace.quota_state.changed']) {
    this.publisher?.publish(
      'workspace.quota-state.changed',
      { workspaceId },
      { changed: true },
      { room: realtimeWorkspaceQuotaStateRoom(workspaceId) }
    );
  }

  private async assertWorkspace(userId: string, workspaceId: string) {
    const role = await this.models.workspaceUser.getActive(workspaceId, userId);
    if (!role) {
      throw new SpaceAccessDenied({ spaceId: workspaceId });
    }
  }

  private serializeState<T extends Record<string, unknown>>(state: T) {
    return Object.fromEntries(
      Object.entries(state).map(([key, value]) => [
        key,
        typeof value === 'bigint' ? Number(value) : value,
      ])
    );
  }
}
