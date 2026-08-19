import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { AccessDenied } from '../../../base';
import { PermissionAccess } from '../../../core/permission';
import type { RuntimeRetrievalScope } from '../../../native';
import { NativeEmbeddingService } from '../embedding/native';

@Injectable()
export class ArtifactRetrievalService {
  constructor(
    private readonly access: PermissionAccess,
    private readonly embedding: NativeEmbeddingService,
    private readonly db: PrismaClient
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
    messageId?: string;
    signal?: AbortSignal;
  }) {
    if (!(await this.authorize(options.userId, options.workspaceId))) {
      throw new AccessDenied();
    }
    let degraded = false;
    let matched: Awaited<ReturnType<NativeEmbeddingService['match']>> = [];
    try {
      matched = await this.embedding.match(
        options.workspaceId,
        options.query,
        'artifact',
        options.retrieval,
        options.limit,
        options.signal
      );
    } catch (error) {
      if (options.signal?.aborted) throw error;
      degraded = true;
    }
    const matchedIds = new Set(matched.map(hit => hit.artifactId));
    const missingRequired =
      options.retrieval.mode === 'required'
        ? options.retrieval.requiredArtifactIds
            .filter(id => !matchedIds.has(id))
            .slice(0, Math.max(0, options.limit - matched.length))
        : [];
    const directAttempts = await Promise.allSettled(
      missingRequired.map(async artifactId => {
        const source = await this.embedding.readSourceContent(
          options.workspaceId,
          'artifact',
          artifactId,
          options.retrieval,
          20_000
        );
        return {
          sourceKind: 'artifact',
          sourceKey: artifactId,
          artifactId,
          content: source.content,
          distance: 0,
          chunk: 0,
        };
      })
    );
    const direct = directAttempts.flatMap(result =>
      result.status === 'fulfilled' ? [result.value] : []
    );
    degraded ||= direct.length !== directAttempts.length;
    const hits = [...matched, ...direct].map(hit => ({
      ...hit,
      artifactId: hit.artifactId ?? hit.sourceKey,
    }));
    const metadata = await this.loadMetadata(
      options.workspaceId,
      hits.map(hit => hit.artifactId),
      options.retrieval,
      options.messageId
    );
    return {
      hits: hits.map(hit => ({ ...hit, ...metadata.get(hit.artifactId) })),
      degraded,
    } as const;
  }

  async read(options: {
    userId: string;
    workspaceId: string;
    artifactId: string;
    retrieval: RuntimeRetrievalScope;
    messageId?: string;
    maxChars?: number;
    cursor?: string;
  }) {
    if (!(await this.authorize(options.userId, options.workspaceId))) {
      throw new AccessDenied();
    }
    const [result, metadata] = await Promise.all([
      this.embedding.readSourceContent(
        options.workspaceId,
        'artifact',
        options.artifactId,
        options.retrieval,
        options.maxChars,
        options.cursor
      ),
      this.loadMetadata(
        options.workspaceId,
        [options.artifactId],
        options.retrieval,
        options.messageId
      ),
    ]);
    return {
      ...result,
      name: metadata.get(options.artifactId)?.name ?? result.name,
      mimeType: metadata.get(options.artifactId)?.mimeType ?? result.mimeType,
    };
  }

  private async loadMetadata(
    workspaceId: string,
    artifactIds: string[],
    retrieval: RuntimeRetrievalScope,
    messageId?: string
  ) {
    const ids = [...new Set(artifactIds)];
    if (!ids.length) {
      return new Map<string, { name?: string; mimeType: string }>();
    }
    const [artifacts, occurrences] = await Promise.all([
      this.db.workspaceArtifact.findMany({
        where: {
          workspaceId,
          id: { in: ids },
          ...(retrieval.mode === 'workspace' ? { libraryOwned: true } : {}),
        },
        select: {
          id: true,
          displayName: true,
          canonicalMediaType: true,
        },
      }),
      retrieval.mode === 'required' && messageId
        ? this.db.aiMessageArtifact.findMany({
            where: {
              workspaceId,
              messageId,
              artifactId: { in: ids },
              role: 'attachment',
            },
            select: { artifactId: true, displayName: true },
          })
        : [],
    ]);
    const occurrenceNames = new Map(
      occurrences.map(occurrence => [
        occurrence.artifactId,
        occurrence.displayName ?? undefined,
      ])
    );
    return new Map(
      artifacts.map(artifact => [
        artifact.id,
        {
          name:
            occurrenceNames.get(artifact.id) ??
            artifact.displayName ??
            undefined,
          mimeType: artifact.canonicalMediaType,
        },
      ])
    );
  }
}
