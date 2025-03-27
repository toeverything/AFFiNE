import { Injectable, OnModuleInit } from '@nestjs/common';
import OpenAI from 'openai';

import {
  AFFiNELogger,
  BlobNotFound,
  Config,
  EventBus,
  JobQueue,
  mapAnyError,
  OnEvent,
  OnJob,
} from '../../../base';
import { DocReader } from '../../../core/doc';
import { Models } from '../../../models';
import { CopilotStorage } from '../storage';
import { OpenAIEmbeddingClient } from './embedding';
import { EmbeddingClient } from './types';
import { readStream } from './utils';

declare global {
  interface Jobs {
    'doc.embedPendingDocs': {
      workspaceId: string;
      docId: string;
    };

    'doc.embedPendingFiles': {
      contextId: string;
      userId: string;
      workspaceId: string;
      blobId: string;
      fileId: string;
      fileName: string;
    };
  }
}

@Injectable()
export class CopilotContextDocJob implements OnModuleInit {
  private supportEmbedding = false;
  private readonly client: EmbeddingClient | undefined;

  constructor(
    config: Config,
    private readonly doc: DocReader,
    private readonly event: EventBus,
    private readonly logger: AFFiNELogger,
    private readonly models: Models,
    private readonly queue: JobQueue,
    private readonly storage: CopilotStorage
  ) {
    this.logger.setContext(CopilotContextDocJob.name);
    const configure = config.plugins.copilot.openai;
    if (configure) {
      this.client = new OpenAIEmbeddingClient(new OpenAI(configure));
    }
  }

  async onModuleInit() {
    this.supportEmbedding =
      await this.models.copilotContext.checkEmbeddingAvailable();
  }

  // public this client to allow overriding in tests
  get embeddingClient() {
    return this.client as EmbeddingClient;
  }

  async addFileEmbeddingQueue(file: Jobs['doc.embedPendingFiles']) {
    if (!this.supportEmbedding) return;

    const { userId, workspaceId, contextId, blobId, fileId, fileName } = file;
    await this.queue.add('doc.embedPendingFiles', {
      userId,
      workspaceId,
      contextId,
      blobId,
      fileId,
      fileName,
    });
  }

  @OnEvent('workspace.doc.embedding')
  async addDocEmbeddingQueue(docs: Events['workspace.doc.embedding']) {
    if (!this.supportEmbedding) return;

    for (const { workspaceId, docId } of docs) {
      await this.queue.add('doc.embedPendingDocs', { workspaceId, docId });
    }
  }

  async readCopilotBlob(
    userId: string,
    workspaceId: string,
    blobId: string,
    fileName: string
  ) {
    const { body } = await this.storage.get(userId, workspaceId, blobId);
    if (!body) throw new BlobNotFound({ spaceId: workspaceId, blobId });
    const buffer = await readStream(body);
    return new File([buffer], fileName);
  }

  @OnJob('doc.embedPendingFiles')
  async embedPendingFile({
    userId,
    workspaceId,
    contextId,
    blobId,
    fileId,
    fileName,
  }: Jobs['doc.embedPendingFiles']) {
    if (!this.supportEmbedding || !this.embeddingClient) return;

    try {
      const file = await this.readCopilotBlob(
        userId,
        workspaceId,
        blobId,
        fileName
      );

      // no need to check if embeddings is empty, will throw internally
      const chunks = await this.embeddingClient.getFileChunks(file);
      const total = chunks.reduce((acc, c) => acc + c.length, 0);

      for (const chunk of chunks) {
        const embeddings = await this.embeddingClient.generateEmbeddings(chunk);
        await this.models.copilotContext.insertContentEmbedding(
          contextId,
          fileId,
          embeddings
        );
      }

      this.event.emit('workspace.file.embed.finished', {
        contextId,
        fileId,
        chunkSize: total,
      });
    } catch (e: any) {
      const error = mapAnyError(e);
      error.log('CopilotJob', {
        workspaceId,
        fileId,
      });

      this.event.emit('workspace.file.embed.failed', {
        contextId,
        fileId,
        error: e.toString(),
      });
    }
  }

  @OnJob('doc.embedPendingDocs')
  async embedPendingDocs({ workspaceId, docId }: Jobs['doc.embedPendingDocs']) {
    if (!this.supportEmbedding) return;

    try {
      const content = await this.doc.getFullDocContent(workspaceId, docId);
      if (content) {
        // no need to check if embeddings is empty, will throw internally
        const embeddings = await this.embeddingClient.getFileEmbeddings(
          new File([content.summary], `${content.title}.md`)
        );

        for (const chunks of embeddings) {
          await this.models.copilotContext.insertWorkspaceEmbedding(
            workspaceId,
            docId,
            chunks
          );
        }
      }
    } catch (e: any) {
      this.logger.error(
        `Failed to embed pending doc: ${workspaceId}::${docId}`,
        e
      );
    }
  }
}
