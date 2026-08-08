import { Injectable } from '@nestjs/common';

import { PermissionAccess } from '../../../core/permission';
import type { RuntimeRetrievalScope } from '../../../native';
import { NativeEmbeddingService } from '../embedding/native';

@Injectable()
export class ArtifactRetrievalService {
  constructor(
    private readonly access: PermissionAccess,
    private readonly embedding: NativeEmbeddingService
  ) {}

  private async authorize(userId: string, workspaceId: string) {
    return await this.access
      .user(userId)
      .workspace(workspaceId)
      .allowLocal()
      .can('Workspace.Read');
  }

  async search(options: {
    userId: string;
    workspaceId: string;
    query: string;
    retrieval: RuntimeRetrievalScope;
    limit: number;
    signal?: AbortSignal;
  }) {
    if (!(await this.authorize(options.userId, options.workspaceId))) {
      throw new Error('ARTIFACT_ACCESS_DENIED');
    }
    try {
      const hits = await this.embedding.match(
        options.workspaceId,
        options.query,
        'artifact',
        options.retrieval,
        options.limit,
        options.signal
      );
      return { hits, degraded: false } as const;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      return { hits: [], degraded: true } as const;
    }
  }

  async read(options: {
    userId: string;
    workspaceId: string;
    artifactId: string;
    retrieval: RuntimeRetrievalScope;
    maxChars?: number;
    cursor?: string;
  }) {
    if (!(await this.authorize(options.userId, options.workspaceId))) {
      throw new Error('ARTIFACT_ACCESS_DENIED');
    }
    return await this.embedding.readSourceContent(
      options.workspaceId,
      'artifact',
      options.artifactId,
      options.retrieval,
      options.maxChars,
      options.cursor
    );
  }
}
