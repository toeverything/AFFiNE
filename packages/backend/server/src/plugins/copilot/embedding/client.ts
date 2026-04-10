import { Logger } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';

import { Config, CopilotProviderNotSupported } from '../../../base';
import { CopilotFailedToGenerateEmbedding } from '../../../base/error/errors.gen';
import {
  ChunkSimilarity,
  Embedding,
  EMBEDDING_DIMENSIONS,
} from '../../../models';
import { CopilotProviderFactory } from '../providers/factory';
import type { CopilotProvider } from '../providers/provider';
import {
  type CopilotRerankRequest,
  type ModelFullConditions,
  ModelInputType,
  ModelOutputType,
} from '../providers/types';
import { EmbeddingClient, type ReRankResult } from './types';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const RERANK_MODEL = 'gpt-4o-mini';
class ProductionEmbeddingClient extends EmbeddingClient {
  private readonly logger = new Logger(ProductionEmbeddingClient.name);

  constructor(
    private readonly config: Config,
    private readonly providerFactory: CopilotProviderFactory
  ) {
    super();
  }

  override async configured(): Promise<boolean> {
    const embedding = await this.providerFactory.getProvider({
      modelId: this.getEmbeddingModelId(),
      outputType: ModelOutputType.Embedding,
    });
    const result = Boolean(embedding);
    if (!result) {
      this.logger.warn(
        'Copilot embedding client is not configured properly, please check your configuration.'
      );
    }
    return result;
  }

  private async getProvider(
    cond: ModelFullConditions
  ): Promise<CopilotProvider> {
    const provider = await this.providerFactory.getProvider(cond);
    if (!provider) {
      throw new CopilotProviderNotSupported({
        provider: 'embedding',
        kind: cond.outputType || 'embedding',
      });
    }
    return provider;
  }

  private getEmbeddingModelId() {
    return this.config.copilot?.scenarios?.override_enabled
      ? this.config.copilot.scenarios.scenarios?.embedding || EMBEDDING_MODEL
      : EMBEDDING_MODEL;
  }

  async getEmbeddings(input: string[]): Promise<Embedding[]> {
    const provider = await this.getProvider({
      modelId: this.getEmbeddingModelId(),
      outputType: ModelOutputType.Embedding,
    });
    this.logger.verbose(
      `Using provider ${provider.type} for embedding: ${input.join(', ')}`
    );

    const embeddings = await provider.embedding(
      { inputTypes: [ModelInputType.Text] },
      input,
      { dimensions: EMBEDDING_DIMENSIONS }
    );
    if (embeddings.length !== input.length) {
      throw new CopilotFailedToGenerateEmbedding({
        provider: provider.type,
        message: `Expected ${input.length} embeddings, got ${embeddings.length}`,
      });
    }

    return Array.from(embeddings.entries()).map(([index, embedding]) => ({
      index,
      embedding,
      content: input[index],
    }));
  }

  private getTargetId<T extends ChunkSimilarity>(embedding: T) {
    return 'docId' in embedding && typeof embedding.docId === 'string'
      ? embedding.docId
      : 'fileId' in embedding && typeof embedding.fileId === 'string'
        ? embedding.fileId
        : '';
  }

  private async getEmbeddingRelevance<
    Chunk extends ChunkSimilarity = ChunkSimilarity,
  >(
    query: string,
    embeddings: Chunk[],
    signal?: AbortSignal
  ): Promise<ReRankResult> {
    if (!embeddings.length) return [];

    const provider = await this.getProvider({
      modelId: RERANK_MODEL,
      outputType: ModelOutputType.Rerank,
    });

    const rerankRequest: CopilotRerankRequest = {
      query,
      candidates: embeddings.map((embedding, index) => ({
        id: String(index),
        text: embedding.content,
      })),
    };

    const ranks = await provider.rerank(
      { modelId: RERANK_MODEL },
      rerankRequest,
      { signal }
    );

    try {
      return ranks.map((score, i) => {
        const chunk = embeddings[i];
        return {
          chunk: chunk.chunk,
          targetId: this.getTargetId(chunk),
          score: Math.max(score, 1 - (chunk.distance || -Infinity)),
        };
      });
    } catch (error) {
      this.logger.error('Failed to parse rerank results', error);
      // silent error, will fallback to default sorting in parent method
      return [];
    }
  }

  override async reRank<Chunk extends ChunkSimilarity = ChunkSimilarity>(
    query: string,
    embeddings: Chunk[],
    topK: number,
    signal?: AbortSignal
  ): Promise<Chunk[]> {
    // search in context and workspace may find same chunks, de-duplicate them
    const { deduped: dedupedEmbeddings } = embeddings.reduce(
      (acc, e) => {
        const key = `${this.getTargetId(e)}:${e.chunk}`;
        if (!acc.seen.has(key)) {
          acc.seen.add(key);
          acc.deduped.push(e);
        }
        return acc;
      },
      { deduped: [] as Chunk[], seen: new Set<string>() }
    );
    const sortedEmbeddings = dedupedEmbeddings.toSorted(
      (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)
    );

    const chunks = sortedEmbeddings.reduce(
      (acc, e) => {
        const targetId = this.getTargetId(e);
        const key = `${targetId}:${e.chunk}`;
        acc[key] = e;
        return acc;
      },
      {} as Record<string, Chunk>
    );

    try {
      // The rerank prompt is expected to handle the full deduped candidate list.
      const ranks = await this.getEmbeddingRelevance(
        query,
        sortedEmbeddings,
        signal
      );
      if (sortedEmbeddings.length !== ranks.length) {
        // llm return wrong result, fallback to default sorting
        this.logger.warn(
          `Batch size mismatch: expected ${sortedEmbeddings.length}, got ${ranks.length}`
        );
        return await super.reRank(query, dedupedEmbeddings, topK, signal);
      }

      const highConfidenceChunks = ranks
        .flat()
        .toSorted((a, b) => b.score - a.score)
        .filter(r => r.score > 0.5)
        .map(r => chunks[`${r.targetId}:${r.chunk}`])
        .filter(Boolean);

      this.logger.verbose(
        `ReRank completed: ${highConfidenceChunks.length} high-confidence results found, total ${sortedEmbeddings.length} embeddings`,
        highConfidenceChunks.length !== sortedEmbeddings.length
          ? JSON.stringify(ranks)
          : undefined
      );
      return highConfidenceChunks.slice(0, topK);
    } catch (error) {
      this.logger.warn('ReRank failed, falling back to default sorting', error);
      return await super.reRank(query, dedupedEmbeddings, topK, signal);
    }
  }
}

let EMBEDDING_CLIENT: EmbeddingClient | undefined;
export async function getEmbeddingClient(
  moduleRef: ModuleRef
): Promise<EmbeddingClient | undefined> {
  if (EMBEDDING_CLIENT) {
    return EMBEDDING_CLIENT;
  }
  const config = moduleRef.get(Config, { strict: false });
  const providerFactory = moduleRef.get(CopilotProviderFactory, {
    strict: false,
  });
  const client = new ProductionEmbeddingClient(config, providerFactory);
  if (await client.configured()) {
    EMBEDDING_CLIENT = client;
  }
  return EMBEDDING_CLIENT;
}

export class MockEmbeddingClient extends EmbeddingClient {
  async getEmbeddings(input: string[]): Promise<Embedding[]> {
    return input.map((_, i) => ({
      index: i,
      content: input[i],
      embedding: Array.from({ length: EMBEDDING_DIMENSIONS }, () =>
        Math.random()
      ),
    }));
  }
}
