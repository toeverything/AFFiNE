import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { nanoid } from 'nanoid';

import { metrics } from '../../../base';
import { BackendRuntimeProvider } from '../../../core/backend-runtime';
import type { DocChunkSimilarity } from '../../../models';
import type {
  RuntimeEmbeddingCandidate,
  RuntimeRetrievalScope,
} from '../../../native';
import { CopilotRerankService } from './rerank';
import type { EmbeddingRouteContext } from './route-context';

@Injectable()
export class NativeEmbeddingService implements OnApplicationBootstrap {
  private supportEmbedding = false;

  constructor(
    private readonly runtime: BackendRuntimeProvider,
    private readonly rerank: CopilotRerankService
  ) {}

  async onApplicationBootstrap() {
    this.supportEmbedding = (await this.health()).enabled;
  }

  get canEmbedding() {
    return this.supportEmbedding;
  }

  async health() {
    const health = await this.runtime.embeddingHealth();
    metrics.ai.counter('embedding_capability_check').add(1, {
      state: health.state,
      enabled: health.enabled,
      reason: health.reason ?? 'none',
      schema: String(health.schemaVersion ?? 0),
      worker: health.workerRunning ? 'running' : 'stopped',
    });
    return health;
  }

  async progress(workspaceId: string) {
    return await this.runtime.embeddingWorkspaceProgress(workspaceId);
  }

  async readSourceContent(
    workspaceId: string,
    sourceKind: 'document' | 'artifact',
    sourceKey: string,
    retrieval: RuntimeRetrievalScope,
    maxChars?: number,
    cursor?: string
  ) {
    return await this.runtime.readEmbeddingSourceContent({
      workspaceId,
      sourceKind,
      sourceKey,
      retrieval,
      maxChars,
      cursor,
    });
  }

  async match(
    workspaceId: string,
    query: string,
    sourceKind: 'document' | 'artifact',
    retrieval: RuntimeRetrievalScope,
    limit: number,
    signal?: AbortSignal
  ): Promise<RuntimeEmbeddingCandidate[]> {
    const startedAt = performance.now();
    signal?.throwIfAborted();
    const requestId = nanoid();
    const abort = () => {
      void this.runtime
        .cancelEmbeddingCandidateRequest(requestId)
        .catch(() => {});
    };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const candidates = await this.runtime.matchEmbeddingCandidates({
        requestId,
        workspaceId,
        query,
        sourceKind,
        retrieval,
        limit,
      });
      signal?.throwIfAborted();
      metrics.ai
        .histogram('embedding_candidate_latency_ms')
        .record(performance.now() - startedAt, {
          corpus: sourceKind,
          mode: retrieval.mode,
          outcome: 'success',
        });
      return candidates;
    } catch (error) {
      metrics.ai.counter('embedding_operation_failure').add(1, {
        operation: 'match',
        kind: sourceKind,
        code: embeddingErrorCode(error),
      });
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }

  async matchWorkspaceDocCandidates(
    workspaceId: string,
    content: string,
    topK = 5,
    docIds?: string[]
  ): Promise<DocChunkSimilarity[]> {
    const retrieval: RuntimeRetrievalScope = {
      mode: docIds ? 'required' : 'workspace',
      requiredDocIds: docIds ?? [],
      requiredArtifactIds: [],
      preferredSourceIds: [],
    };
    return (
      await this.match(workspaceId, content, 'document', retrieval, topK * 2)
    )
      .filter(candidate => candidate.docId)
      .map(candidate => ({
        docId: candidate.docId as string,
        chunk: candidate.chunk,
        content: candidate.content,
        distance: candidate.distance,
        unitId: candidate.unitId ?? '',
        visibility: (candidate.visibility ?? 'page') as
          | 'page'
          | 'edgeless'
          | 'both',
        blockId: candidate.blockId ?? undefined,
        elementId: candidate.elementId ?? undefined,
        frameId: candidate.frameId ?? undefined,
      }));
  }

  async rerankWorkspaceDocs(
    workspaceId: string,
    content: string,
    candidates: DocChunkSimilarity[],
    topK = 5,
    routeContext?: EmbeddingRouteContext
  ) {
    if (!candidates.length) return [];
    return await this.rerank.rerank(
      content,
      candidates,
      topK,
      workspaceId,
      routeContext
    );
  }

  async recordQueueCounts() {
    const counts = await this.runtime.embeddingQueueCounts();
    for (const status of [
      'pending',
      'running',
      'retryWait',
      'ready',
      'failed',
    ] as const) {
      metrics.ai
        .gauge('embedding_queue_status')
        .record(Number(counts[status]), { status });
    }
    metrics.ai
      .gauge('embedding_vector_rows')
      .record(Number(counts.activeVectorRows), { state: 'active' });
    metrics.ai
      .gauge('embedding_vector_rows')
      .record(Number(counts.inactiveVectorRows), { state: 'inactive' });
    metrics.ai
      .gauge('embedding_index_size_bytes')
      .record(Number(counts.indexBytes));
    metrics.ai
      .gauge('embedding_index_retry')
      .record(Number(counts.retryingIndexes), { measure: 'indexes' });
    metrics.ai
      .gauge('embedding_index_retry')
      .record(Number(counts.maxIndexRetrySeconds), {
        measure: 'max_delay_seconds',
      });
  }
}

function embeddingErrorCode(error: unknown) {
  if (!(error instanceof Error)) return 'unknown';
  if (error.message.includes('resource_exceeded')) return 'resource_exceeded';
  if (error.message.includes('embedding_unavailable')) return 'unavailable';
  if (error.message.includes('not_found')) return 'not_found';
  if (error.message.includes('disabled')) return 'disabled';
  return 'failed';
}
