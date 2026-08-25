import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';

import { Config } from '../../../base/config';
import { PermissionAccess } from '../../../core/permission';
import {
  RealtimeRegistry,
  realtimeWorkspaceEmbeddingProgressRoom,
  registerRealtimeLiveQuery,
} from '../../../core/realtime';
import { assertCopilotEnabled } from '../availability';
import { NativeEmbeddingService } from './native';

@Injectable()
export class CopilotEmbeddingRealtimeProvider implements OnModuleInit {
  constructor(
    private readonly ac: PermissionAccess,
    private readonly embedding: NativeEmbeddingService,
    private readonly registry: RealtimeRegistry,
    private readonly config: Config
  ) {}

  onModuleInit() {
    const input = z.object({ workspaceId: z.string() });
    registerRealtimeLiveQuery(this.registry, {
      request: {
        name: 'workspace.embedding.progress.get',
        input,
        handle: async (user, payload) => {
          await this.assertCopilot(user.id, payload.workspaceId);
          const health = await this.embedding.health();
          return health.enabled
            ? await this.embedding.progress(payload.workspaceId)
            : { total: 0, embedded: 0 };
        },
      },
      topic: {
        name: 'workspace.embedding.progress.changed',
        input,
        authorize: async (user, payload) => {
          await this.assertCopilot(user.id, payload.workspaceId);
        },
        room: (_user, payload) =>
          realtimeWorkspaceEmbeddingProgressRoom(payload.workspaceId),
      },
    });
  }

  private async assertCopilot(userId: string, workspaceId: string) {
    assertCopilotEnabled(this.config);
    await this.ac
      .user(userId)
      .workspace(workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');
  }
}
