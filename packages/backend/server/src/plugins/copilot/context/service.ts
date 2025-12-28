import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import {
  Cache,
  CopilotInvalidContext,
  NoCopilotProviderAvailable,
  OnEvent,
} from '../../../base';
import {
  ContextConfig,
  ContextConfigSchema,
  ContextDoc,
  ContextEmbedStatus,
  ContextFile,
  Models,
} from '../../../models';
import { type EmbeddingClient, getEmbeddingClient } from '../embedding';
import { ContextSession } from './session';

const CONTEXT_SESSION_KEY = 'context-session';

@Injectable()
export class CopilotContextService implements OnApplicationBootstrap {
  private supportEmbedding = false;
  private client: EmbeddingClient | undefined;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly cache: Cache,
    private readonly models: Models
  ) {}

  @OnEvent('config.init')
  async onConfigInit() {
    await this.setup();
  }

  @OnEvent('config.changed')
  async onConfigChanged() {
    await this.setup();
  }

  private async setup() {
    this.client = await getEmbeddingClient(this.moduleRef);
  }

  async onApplicationBootstrap() {
    const supportEmbedding =
      await this.models.copilotContext.checkEmbeddingAvailable();
    if (supportEmbedding) {
      this.supportEmbedding = true;
    }
  }

  get canEmbedding() {
    return this.supportEmbedding;
  }

  // public this client to allow overriding in tests
  get embeddingClient() {
    return this.client as EmbeddingClient;
  }

  private async saveConfig(
    contextId: string,
    config: ContextConfig,
    refreshCache = false
  ): Promise<void> {
    if (!refreshCache) {
      await this.models.copilotContext.update(contextId, { config });
    }
    await this.cache.set(`${CONTEXT_SESSION_KEY}:${contextId}`, config);
  }

  private async getCachedSession(
    contextId: string
  ): Promise<ContextSession | undefined> {
    const cachedSession = await this.cache.get(
      `${CONTEXT_SESSION_KEY}:${contextId}`
    );
    if (cachedSession) {
      const config = ContextConfigSchema.safeParse(cachedSession);
      if (config.success) {
        return new ContextSession(
          this.embeddingClient,
          contextId,
          config.data,
          this.models,
          this.saveConfig.bind(this, contextId)
        );
      }
    }
    return undefined;
  }

  // NOTE: we only cache config to avoid frequent database queries
  // but we do not need to cache session instances because a distributed
  // lock is already apply to mutation operation for the same context in
  // the resolver, so there will be no simultaneous writing to the config
  private async cacheSession(
    contextId: string,
    config: ContextConfig
  ): Promise<ContextSession> {
    const dispatcher = this.saveConfig.bind(this, contextId);
    await dispatcher(config, true);
    return new ContextSession(
      this.embeddingClient,
      contextId,
      config,
      this.models,
      dispatcher
    );
  }

  async create(sessionId: string): Promise<ContextSession> {
    // keep the context unique per session
    const existsContext = await this.getBySessionId(sessionId);
    if (existsContext) return existsContext;

    const context = await this.models.copilotContext.create(sessionId);
    const config = ContextConfigSchema.parse(context.config);
    return await this.cacheSession(context.id, config);
  }

  async get(id: string): Promise<ContextSession> {
    if (!this.embeddingClient) {
      throw new NoCopilotProviderAvailable(
        { modelId: 'embedding' },
        'embedding client not configured'
      );
    }

    const context = await this.getCachedSession(id);
    if (context) return context;
    const config = await this.models.copilotContext.getConfig(id);
    if (config) {
      return this.cacheSession(id, config);
    }
    throw new CopilotInvalidContext({ contextId: id });
  }

  async getBySessionId(sessionId: string): Promise<ContextSession | null> {
    const existsContext =
      await this.models.copilotContext.getBySessionId(sessionId);
    if (existsContext) return this.get(existsContext.id);
    return null;
  }

  async matchWorkspaceBlobs(
    workspaceId: string,
    content: string,
    topK: number = 5,
    signal?: AbortSignal,
    threshold: number = 0.5
  ) {
    if (!this.embeddingClient) return [];
    const embedding = await this.embeddingClient.getEmbedding(content, signal);
    if (!embedding) return [];

    const blobChunks = await this.models.copilotWorkspace.matchBlobEmbedding(
      workspaceId,
      embedding,
      topK * 2,
      threshold
    );
    if (!blobChunks.length) return [];

    return await this.embeddingClient.reRank(content, blobChunks, topK, signal);
  }

  async matchWorkspaceFiles(
    workspaceId: string,
    content: string,
    topK: number = 5,
    signal?: AbortSignal,
    threshold: number = 0.5
  ) {
    if (!this.embeddingClient) return [];
    const embedding = await this.embeddingClient.getEmbedding(content, signal);
    if (!embedding) return [];

    const fileChunks = await this.models.copilotWorkspace.matchFileEmbedding(
      workspaceId,
      embedding,
      topK * 2,
      threshold
    );
    if (!fileChunks.length) return [];

    return await this.embeddingClient.reRank(content, fileChunks, topK, signal);
  }

  async matchWorkspaceDocs(
    workspaceId: string,
    content: string,
    topK: number = 5,
    signal?: AbortSignal,
    threshold: number = 0.5
  ) {
    if (!this.embeddingClient) return [];
    const embedding = await this.embeddingClient.getEmbedding(content, signal);
    if (!embedding) return [];

    const workspaceChunks =
      await this.models.copilotContext.matchWorkspaceEmbedding(
        embedding,
        workspaceId,
        topK * 2,
        threshold
      );
    if (!workspaceChunks.length) return [];

    return await this.embeddingClient.reRank(
      content,
      workspaceChunks,
      topK,
      signal
    );
  }

  async matchWorkspaceAll(
    workspaceId: string,
    content: string,
    topK: number,
    signal?: AbortSignal,
    threshold: number = 0.8,
    docIds?: string[],
    scopedThreshold: number = 0.85
  ) {
    if (!this.embeddingClient) return [];
    const embedding = await this.embeddingClient.getEmbedding(content, signal);
    if (!embedding) return [];

    const [fileChunks, blobChunks, workspaceChunks, scopedWorkspaceChunks] =
      await Promise.all([
        this.models.copilotWorkspace.matchFileEmbedding(
          workspaceId,
          embedding,
          topK * 2,
          threshold
        ),
        this.models.copilotWorkspace.matchBlobEmbedding(
          workspaceId,
          embedding,
          topK * 2,
          threshold
        ),
        this.models.copilotContext.matchWorkspaceEmbedding(
          embedding,
          workspaceId,
          topK * 2,
          threshold
        ),
        docIds
          ? this.models.copilotContext.matchWorkspaceEmbedding(
              embedding,
              workspaceId,
              topK * 2,
              scopedThreshold,
              docIds
            )
          : null,
      ]);

    if (
      !fileChunks.length &&
      !blobChunks.length &&
      !workspaceChunks.length &&
      !scopedWorkspaceChunks?.length
    ) {
      return [];
    }

    return await this.embeddingClient.reRank(
      content,
      [
        ...fileChunks,
        ...blobChunks,
        ...workspaceChunks,
        ...(scopedWorkspaceChunks || []),
      ],
      topK,
      signal
    );
  }

  @OnEvent('workspace.doc.embed.failed')
  async onDocEmbedFailed({
    contextId,
    docId,
  }: Events['workspace.doc.embed.failed']) {
    const context = await this.get(contextId);
    await context.saveDocRecord(docId, doc => ({
      ...(doc as ContextDoc),
      status: ContextEmbedStatus.failed,
    }));
  }

  @OnEvent('workspace.file.embed.finished')
  async onFileEmbedFinish({
    contextId,
    fileId,
    chunkSize,
  }: Events['workspace.file.embed.finished']) {
    const context = await this.get(contextId);
    await context.saveFileRecord(fileId, file => ({
      ...(file as ContextFile),
      chunkSize,
      status: ContextEmbedStatus.finished,
    }));
  }

  @OnEvent('workspace.file.embed.failed')
  async onFileEmbedFailed({
    contextId,
    fileId,
    error,
  }: Events['workspace.file.embed.failed']) {
    const context = await this.get(contextId);
    await context.saveFileRecord(fileId, file => ({
      ...(file as ContextFile),
      error,
      status: ContextEmbedStatus.failed,
    }));
  }
}
