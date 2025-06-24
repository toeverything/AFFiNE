import { Logger } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';

import {
  CopilotPromptNotFound,
  CopilotProviderNotSupported,
} from '../../../base';
import { ChunkSimilarity, Embedding } from '../../../models';
import { PromptService } from '../prompt';
import {
  type CopilotProvider,
  CopilotProviderFactory,
  type ModelFullConditions,
  ModelInputType,
  ModelOutputType,
} from '../providers';
import {
  EMBEDDING_DIMENSIONS,
  EmbeddingClient,
  getReRankSchema,
  type ReRankResult,
} from './types';

const RERANK_PROMPT = 'Rerank results';

class ProductionEmbeddingClient extends EmbeddingClient {
  private readonly logger = new Logger(ProductionEmbeddingClient.name);

  constructor(
    private readonly providerFactory: CopilotProviderFactory,
    private readonly prompt: PromptService
  ) {
    super();
  }

  override async configured(): Promise<boolean> {
    const embedding = await this.providerFactory.getProvider({
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

  async getEmbeddings(input: string[]): Promise<Embedding[]> {
    const provider = await this.getProvider({
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

    return Array.from(embeddings.entries()).map(([index, embedding]) => ({
      index,
      embedding,
      content: input[index],
    }));
  }

  private getTargetId<T extends ChunkSimilarity>(embedding: T) {
    return 'docId' in embedding
      ? embedding.docId
      : 'fileId' in embedding
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

    const prompt = await this.prompt.get(RERANK_PROMPT);
    if (!prompt) {
      throw new CopilotPromptNotFound({ name: RERANK_PROMPT });
    }
    const provider = await this.getProvider({ modelId: prompt.model });
    const schema = getReRankSchema(embeddings.length);

    const ranks = await provider.structure(
      { modelId: prompt.model },
      prompt.finish({
        query,
        results: embeddings.map(e => ({
          targetId: this.getTargetId(e),
          chunk: e.chunk,
          content: e.content,
        })),
        schema,
      }),
      { maxRetries: 3, signal }
    );

    try {
      return schema.parse(JSON.parse(ranks)).ranks;
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
        const targetId = 'docId' in e ? e.docId : 'fileId' in e ? e.fileId : '';
        const key = `${targetId}:${e.chunk}`;
        acc[key] = e;
        return acc;
      },
      {} as Record<string, Chunk>
    );

    try {
      // 4.1 mini's context windows large enough to handle all embeddings
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
        .toSorted((a, b) => b.scores.score - a.scores.score)
        .filter(r => r.scores.score > 5)
        .map(r => chunks[`${r.scores.targetId}:${r.scores.chunk}`])
        .filter(Boolean);

      this.logger.verbose(
        `ReRank completed: ${highConfidenceChunks.length} high-confidence results found`
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
  const providerFactory = moduleRef.get(CopilotProviderFactory, {
    strict: false,
  });
  const prompt = moduleRef.get(PromptService, { strict: false });

  const client = new ProductionEmbeddingClient(providerFactory, prompt);
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
