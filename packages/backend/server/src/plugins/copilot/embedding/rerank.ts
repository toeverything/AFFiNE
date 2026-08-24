import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import type { ChunkSimilarity } from '../../../models';
import {
  EMBEDDING_RERANK_RUNTIME,
  type EmbeddingRerankRuntime,
  type EmbeddingRouteContext,
} from './route-context';

@Injectable()
export class CopilotRerankService {
  constructor(
    @Inject(ModuleRef)
    private readonly moduleRef: ModuleRef
  ) {}

  async rerank<T extends ChunkSimilarity>(
    query: string,
    candidates: T[],
    topK: number,
    workspaceId: string,
    routeContext: EmbeddingRouteContext = {},
    signal?: AbortSignal
  ): Promise<T[]> {
    if (signal?.aborted) throw new Error('SEARCH_ABORTED');
    if (!candidates.length) return [];
    try {
      const runtime = this.moduleRef.get<EmbeddingRerankRuntime>(
        EMBEDDING_RERANK_RUNTIME,
        { strict: false }
      );
      const scores = await runtime.rerank(
        'route-selected',
        {
          query,
          candidates: candidates.map((candidate, index) => ({
            id: String(index),
            text: candidate.content,
          })),
        },
        {
          workspace: workspaceId,
          byokLeaseId: routeContext.byokLeaseId,
          featureKind: 'rerank',
          signal,
        }
      );
      if (signal?.aborted) throw new Error('SEARCH_ABORTED');
      if (scores.length !== candidates.length) {
        return candidates
          .toSorted(
            (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)
          )
          .slice(0, topK);
      }
      return candidates
        .map((candidate, index) => ({ candidate, score: scores[index] }))
        .toSorted((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(item => item.candidate);
    } catch (error) {
      if (signal?.aborted) throw new Error('SEARCH_ABORTED', { cause: error });
      return candidates
        .toSorted((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
        .slice(0, topK);
    }
  }
}
