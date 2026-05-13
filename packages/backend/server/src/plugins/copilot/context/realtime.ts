import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';

import { OnEvent } from '../../../base';
import { AccessController } from '../../../core/permission';
import {
  RealtimePublisher,
  RealtimeRegistry,
  realtimeWorkspaceEmbeddingProgressRoom,
  registerRealtimeLiveQuery,
} from '../../../core/realtime';
import { Models } from '../../../models';
import { CopilotContextService } from './service';

export function workspaceEmbeddingRoom(workspaceId: string) {
  return realtimeWorkspaceEmbeddingProgressRoom(workspaceId);
}

@Injectable()
export class CopilotEmbeddingRealtimeProvider implements OnModuleInit {
  constructor(
    private readonly ac: AccessController,
    private readonly models: Models,
    private readonly context: CopilotContextService,
    private readonly registry: RealtimeRegistry,
    private readonly publisher: RealtimePublisher
  ) {}

  onModuleInit() {
    const input = z.object({ workspaceId: z.string() });

    registerRealtimeLiveQuery(this.registry, {
      request: {
        name: 'workspace.embedding.progress.get',
        input,
        handle: async (user, payload) => {
          await this.assertCopilot(user.id, payload.workspaceId);
          if (!this.context.canEmbedding) {
            return { total: 0, embedded: 0 };
          }
          return await this.models.copilotWorkspace.getEmbeddingStatus(
            payload.workspaceId
          );
        },
      },
      topic: {
        name: 'workspace.embedding.progress.changed',
        input,
        authorize: async (user, payload) => {
          await this.assertCopilot(user.id, payload.workspaceId);
        },
        room: (_user, payload) => workspaceEmbeddingRoom(payload.workspaceId),
      },
    });
  }

  @OnEvent('workspace.doc.embed.finished', { suppressError: true })
  async onDocEmbedFinished(payload: Events['workspace.doc.embed.finished']) {
    await this.publishContext(payload.contextId, 'finished');
  }

  @OnEvent('workspace.doc.embed.failed', { suppressError: true })
  async onDocEmbedFailed(payload: Events['workspace.doc.embed.failed']) {
    await this.publishContext(payload.contextId, 'failed');
  }

  @OnEvent('workspace.file.embed.finished', { suppressError: true })
  async onFileEmbedFinished(payload: Events['workspace.file.embed.finished']) {
    await this.publishContext(payload.contextId, 'finished');
  }

  @OnEvent('workspace.file.embed.failed', { suppressError: true })
  async onFileEmbedFailed(payload: Events['workspace.file.embed.failed']) {
    await this.publishContext(payload.contextId, 'failed');
  }

  @OnEvent('workspace.blob.embed.finished', { suppressError: true })
  async onBlobEmbedFinished(payload: Events['workspace.blob.embed.finished']) {
    await this.publishContext(payload.contextId, 'finished');
  }

  @OnEvent('workspace.blob.embed.failed', { suppressError: true })
  async onBlobEmbedFailed(payload: Events['workspace.blob.embed.failed']) {
    await this.publishContext(payload.contextId, 'failed');
  }

  private async publishContext(
    contextId: string,
    reason: 'finished' | 'failed'
  ) {
    if (!this.publisher) return;
    const context = await this.context.get(contextId);
    this.publisher.publish(
      'workspace.embedding.progress.changed',
      { workspaceId: context.workspaceId },
      { reason },
      { room: workspaceEmbeddingRoom(context.workspaceId) }
    );
  }

  private async assertCopilot(userId: string, workspaceId: string) {
    await this.ac
      .user(userId)
      .workspace(workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');
  }
}
