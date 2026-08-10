import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { FileUpload, PaginationInput, sniffMime } from '../../../base';
import { ServerFeature, ServerService } from '../../../core';
import { BackendRuntimeProvider } from '../../../core/backend-runtime';
import { Models } from '../../../models';
import { NativeEmbeddingService } from '../embedding/native';
import { readStream } from '../utils';

@Injectable()
export class CopilotWorkspaceService implements OnApplicationBootstrap {
  private supportEmbedding = false;

  constructor(
    private readonly server: ServerService,
    private readonly models: Models,
    private readonly embedding: NativeEmbeddingService,
    private readonly runtime: BackendRuntimeProvider,
    private readonly db: PrismaClient
  ) {}

  async onApplicationBootstrap() {
    const health = await this.embedding.health();
    if (health.enabled) {
      this.server.enableFeature(ServerFeature.CopilotEmbedding);
      this.supportEmbedding = true;
    }
  }

  get canEmbedding() {
    return this.supportEmbedding;
  }

  async updateIgnoredDocs(
    workspaceId: string,
    add?: string[],
    remove?: string[]
  ) {
    return await this.models.copilotWorkspace.updateIgnoredDocs(
      workspaceId,
      add,
      remove
    );
  }

  async listIgnoredDocs(
    workspaceId: string,
    pagination?: {
      includeRead?: boolean;
    } & PaginationInput
  ) {
    return await Promise.all([
      this.models.copilotWorkspace.listIgnoredDocs(workspaceId, pagination),
      this.models.copilotWorkspace.countIgnoredDocs(workspaceId),
    ]);
  }

  async addArtifact(workspaceId: string, content: FileUpload) {
    const buffer = await readStream(content.createReadStream());
    const artifact = await this.runtime.putWorkspaceArtifact(
      {
        workspaceId,
        mimeType: sniffMime(buffer, content.mimetype) || content.mimetype,
        displayName: content.filename,
        fileName: content.filename,
        libraryOwned: true,
      },
      buffer
    );
    return await this.getArtifact(workspaceId, artifact.id);
  }

  async getArtifact(workspaceId: string, artifactId: string) {
    const artifact = await this.db.workspaceArtifact.findUniqueOrThrow({
      where: {
        id: artifactId,
        workspaceId,
        libraryOwned: true,
        status: 'ready',
      },
    });
    const statuses = await this.embeddingStatuses(workspaceId, [artifact.id]);
    return this.projectArtifact(
      artifact,
      statuses.get(artifact.id) ?? 'processing'
    );
  }

  async listArtifacts(
    workspaceId: string,
    pagination?: {
      includeRead?: boolean;
    } & PaginationInput
  ) {
    const where = { workspaceId, libraryOwned: true, status: 'ready' };
    const [artifacts, count] = await Promise.all([
      this.db.workspaceArtifact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination?.offset,
        take: pagination?.first,
      }),
      this.db.workspaceArtifact.count({ where }),
    ]);
    const statuses = await this.embeddingStatuses(
      workspaceId,
      artifacts.map(artifact => artifact.id)
    );
    return [
      artifacts.map(artifact =>
        this.projectArtifact(
          artifact,
          statuses.get(artifact.id) ?? 'processing'
        )
      ),
      count,
    ] as const;
  }

  async removeArtifact(workspaceId: string, artifactId: string) {
    await this.runtime.setArtifactLibraryOwned(workspaceId, artifactId, false);
    return true;
  }

  private async embeddingStatuses(workspaceId: string, artifactIds: string[]) {
    if (artifactIds.length === 0)
      return new Map<string, 'processing' | 'ready' | 'failed'>();
    const rows = await this.db.$queryRaw<
      { artifactId: string; status: 'processing' | 'ready' | 'failed' }[]
    >`
      SELECT artifact.id::text AS "artifactId",
        CASE
          WHEN projection.status='ready'
            AND projection.applied_content_revision=source.content_revision THEN 'ready'
          WHEN projection.status='failed' THEN 'failed'
          ELSE 'processing'
        END AS status
      FROM workspace_artifacts artifact
      LEFT JOIN embedding_sources source
        ON source.workspace_id=artifact.workspace_id
        AND source.source_kind='artifact'
        AND source.source_key=artifact.id::text
        AND source.deleted_at IS NULL
      LEFT JOIN embedding_workspace_states state
        ON state.workspace_id=artifact.workspace_id
      LEFT JOIN embedding_projections projection
        ON projection.source_id=source.id
        AND projection.index_id=state.active_index_id
      WHERE artifact.workspace_id=${workspaceId}
        AND artifact.id::text IN (${Prisma.join(artifactIds)})
    `;
    return new Map(rows.map(row => [row.artifactId, row.status]));
  }

  private projectArtifact(
    artifact: {
      id: string;
      workspaceId: string;
      contentHash: string;
      displayName: string | null;
      canonicalMediaType: string;
      sizeBytes: bigint;
      createdAt: Date;
    },
    embeddingStatus: 'processing' | 'ready' | 'failed'
  ) {
    if (!artifact.displayName) {
      throw new Error('Library artifact display name is missing');
    }
    return {
      workspaceId: artifact.workspaceId,
      artifactId: artifact.id,
      contentHash: artifact.contentHash,
      fileName: artifact.displayName,
      embeddingStatus,
      mediaType: artifact.canonicalMediaType,
      size: Number(artifact.sizeBytes),
      createdAt: artifact.createdAt,
    };
  }
}
