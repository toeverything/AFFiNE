import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';

import { OnEvent } from '../../../base';
import { PermissionAccess } from '../../../core/permission';
import {
  RealtimePublisher,
  RealtimeRegistry,
  realtimeWorkspaceEmbeddingProgressRoom,
  registerRealtimeLiveQuery,
} from '../../../core/realtime';
import { Models } from '../../../models';

export function workspaceEmbeddingRoom(workspaceId: string) {
  return realtimeWorkspaceEmbeddingProgressRoom(workspaceId);
}

@Injectable()
export class CopilotEmbeddingRealtimeProvider implements OnModuleInit {
  constructor(
    private readonly ac: PermissionAccess,
    private readonly models: Models,
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
          const canEmbedding =
            await this.models.copilotWorkspace.checkEmbeddingAvailable();
          if (!canEmbedding) {
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
    await this.publishEmbeddingProgress(payload, 'finished');
  }

  @OnEvent('workspace.file.embed.failed', { suppressError: true })
  async onFileEmbedFailed(payload: Events['workspace.file.embed.failed']) {
    await this.publishEmbeddingProgress(payload, 'failed');
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
    const context = await this.models.copilotContext.getConfig(contextId);
    if (!context) return;
    this.publishWorkspace(context.workspaceId, reason);
  }

  private async publishEmbeddingProgress(
    payload:
      | Events['workspace.file.embed.finished']
      | Events['workspace.file.embed.failed'],
    reason: 'finished' | 'failed'
  ) {
    if (!this.publisher) return;
    if (payload.contextId) {
      await this.publishContext(payload.contextId, reason);
      return;
    }
    this.publishWorkspace(payload.workspaceId, reason);
  }

  private publishWorkspace(workspaceId: string, reason: 'finished' | 'failed') {
    this.publisher.publish(
      'workspace.embedding.progress.changed',
      { workspaceId },
      { reason },
      { room: workspaceEmbeddingRoom(workspaceId) }
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
