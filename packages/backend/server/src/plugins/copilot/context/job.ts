import { Injectable } from '@nestjs/common';

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
import { readStream } from '../utils';
import { OpenAIEmbeddingClient } from './embedding';
import { EmbeddingClient } from './types';

@Injectable()
export class CopilotContextDocJob {
  private supportEmbedding = false;
  private client: EmbeddingClient | undefined;

  constructor(
    private readonly config: Config,
    private readonly doc: DocReader,
    private readonly event: EventBus,
    private readonly logger: AFFiNELogger,
    private readonly models: Models,
    private readonly queue: JobQueue,
    private readonly storage: CopilotStorage
  ) {
    this.logger.setContext(CopilotContextDocJob.name);
  }

  @OnEvent('config.init')
  async onConfigInit() {
    await this.setup();
  }

  @OnEvent('config.changed')
  async onConfigChanged() {
    await this.setup();
  }

  private async setup() {
    this.supportEmbedding =
      await this.models.copilotContext.checkEmbeddingAvailable();
    this.client = new OpenAIEmbeddingClient(
      this.config.copilot.providers.openai
    );
  }

  // public this client to allow overriding in tests
  get embeddingClient() {
    return this.client as EmbeddingClient;
  }

  async addFileEmbeddingQueue(file: Jobs['copilot.embedding.files']) {
    if (!this.supportEmbedding) return;

    const { userId, workspaceId, contextId, blobId, fileId, fileName } = file;
    await this.queue.add('copilot.embedding.files', {
      userId,
      workspaceId,
      contextId,
      blobId,
      fileId,
      fileName,
    });
  }

  @OnEvent('workspace.doc.embedding')
  async addDocEmbeddingQueue(
    docs: Events['workspace.doc.embedding'],
    contextId?: string
  ) {
    if (!this.supportEmbedding) return;

    for (const { workspaceId, docId } of docs) {
      await this.queue.add('copilot.embedding.docs', {
        contextId,
        workspaceId,
        docId,
      });
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

  @OnJob('copilot.embedding.files')
  async embedPendingFile({
    userId,
    workspaceId,
    contextId,
    blobId,
    fileId,
    fileName,
  }: Jobs['copilot.embedding.files']) {
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
        if (contextId) {
          // for context files
          await this.models.copilotContext.insertFileEmbedding(
            contextId,
            fileId,
            embeddings
          );
        } else {
          // for workspace files
          await this.models.copilotWorkspace.insertFileEmbeddings(
            workspaceId,
            fileId,
            embeddings
          );
        }
      }

      if (contextId) {
        this.event.emit('workspace.file.embed.finished', {
          contextId,
          fileId,
          chunkSize: total,
        });
      }
    } catch (error: any) {
      if (contextId) {
        this.event.emit('workspace.file.embed.failed', {
          contextId,
          fileId,
          error: mapAnyError(error).message,
        });
      }

      // passthrough error to job queue
      throw error;
    }
  }

  @OnJob('copilot.embedding.docs')
  async embedPendingDocs({
    contextId,
    workspaceId,
    docId,
  }: Jobs['copilot.embedding.docs']) {
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
    } catch (error: any) {
      if (contextId) {
        this.event.emit('workspace.doc.embed.failed', {
          contextId,
          docId,
        });
      }

      // passthrough error to job queue
      throw error;
    }
  }
}
