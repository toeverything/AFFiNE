import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

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
    return this.projectArtifact(artifact);
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
    return [
      artifacts.map(artifact => this.projectArtifact(artifact)),
      count,
    ] as const;
  }

  async removeArtifact(workspaceId: string, artifactId: string) {
    await this.runtime.setArtifactLibraryOwned(workspaceId, artifactId, false);
    return true;
  }

  private projectArtifact(artifact: {
    id: string;
    workspaceId: string;
    contentHash: string;
    canonicalMediaType: string;
    sizeBytes: bigint;
    createdAt: Date;
  }) {
    return {
      workspaceId: artifact.workspaceId,
      artifactId: artifact.id,
      contentHash: artifact.contentHash,
      mediaType: artifact.canonicalMediaType,
      size: Number(artifact.sizeBytes),
      createdAt: artifact.createdAt,
    };
  }
}
