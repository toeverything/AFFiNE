import { createHash } from 'node:crypto';

import { Injectable, OnApplicationBootstrap } from '@nestjs/common';

import {
  FileUpload,
  JobQueue,
  PaginationInput,
  sniffMime,
} from '../../../base';
import { ServerFeature, ServerService } from '../../../core';
import { Models } from '../../../models';
import { CopilotStorage } from '../storage';
import { readStream } from '../utils';

@Injectable()
export class CopilotWorkspaceService implements OnApplicationBootstrap {
  private supportEmbedding = false;

  constructor(
    private readonly server: ServerService,
    private readonly models: Models,
    private readonly queue: JobQueue,
    private readonly storage: CopilotStorage
  ) {}

  async onApplicationBootstrap() {
    const supportEmbedding =
      await this.models.copilotWorkspace.checkEmbeddingAvailable();
    if (supportEmbedding) {
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

  async addFile(userId: string, workspaceId: string, content: FileUpload) {
    const fileName = content.filename;
    const buffer = await readStream(content.createReadStream());
    const blobId = createHash('sha256').update(buffer).digest('base64url');
    await this.storage.put(userId, workspaceId, blobId, buffer);
    const file = await this.models.copilotWorkspace.addFile(workspaceId, {
      fileName,
      blobId,
      mimeType: sniffMime(buffer, content.mimetype) || content.mimetype,
      size: buffer.length,
    });
    return { blobId, file };
  }

  async getFile(workspaceId: string, fileId: string) {
    return await this.models.copilotWorkspace.getFile(workspaceId, fileId);
  }

  async listFiles(
    workspaceId: string,
    pagination?: {
      includeRead?: boolean;
    } & PaginationInput
  ) {
    return await Promise.all([
      this.models.copilotWorkspace.listFiles(workspaceId, pagination),
      this.models.copilotWorkspace.countFiles(workspaceId),
    ]);
  }

  async queueFileEmbedding(file: Jobs['copilot.embedding.files']) {
    const { userId, workspaceId, blobId, fileId, fileName } = file;
    await this.queue.add('copilot.embedding.files', {
      userId,
      workspaceId,
      blobId,
      fileId,
      fileName,
    });
  }

  async removeFile(workspaceId: string, fileId: string) {
    return await this.models.copilotWorkspace.removeFile(workspaceId, fileId);
  }
}
