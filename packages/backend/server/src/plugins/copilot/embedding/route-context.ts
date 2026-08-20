export type EmbeddingRouteContext = {
  byokLeaseId?: string;
};

export const EMBEDDING_RERANK_RUNTIME = Symbol('EMBEDDING_RERANK_RUNTIME');

export interface EmbeddingRerankRuntime {
  rerank(
    modelId: string,
    request: { query: string; candidates: { id: string; text: string }[] },
    options: {
      workspace: string;
      byokLeaseId?: string;
      featureKind: 'rerank';
      signal?: AbortSignal;
    }
  ): Promise<number[]>;
}
