import { Inject, Injectable } from '@nestjs/common';

import { SearchProviderUnavailable } from '../../../base';
import { PermissionAccess } from '../../../core/permission';
import type { DocVisibility } from '../../../core/utils/blocksuite';
import { type DocChunkSimilarity, Models } from '../../../models';
import { IndexerService } from '../../indexer/service';
import type { SearchDoc } from '../../indexer/types';
import type { EmbeddingRouteContext } from '../embedding/route-context';

type DocumentSearchContext =
  | {
      user?: string;
      workspace?: string;
      byokLeaseId?: string;
    }
  | undefined;

type DocumentVectorSearch = {
  readonly canEmbedding: boolean;
  matchWorkspaceDocCandidates(
    workspaceId: string,
    content: string,
    topK?: number,
    docIds?: string[]
  ): Promise<DocChunkSimilarity[]>;
  rerankWorkspaceDocs(
    workspaceId: string,
    content: string,
    candidates: DocChunkSimilarity[],
    topK?: number,
    routeContext?: EmbeddingRouteContext
  ): Promise<DocChunkSimilarity[]>;
};

export const DOCUMENT_VECTOR_SEARCH = Symbol('DOCUMENT_VECTOR_SEARCH');

export type DocumentSearchHit = {
  docId: string;
  title: string;
  excerpt: string;
  visibility: DocVisibility;
  blockId?: string;
  elementId?: string;
  frameId?: string;
  updatedAt?: Date;
  score: number;
  unitId: string;
};

type Candidate = DocumentSearchHit & { channels: Set<'lexical' | 'vector'> };
type ProjectedSearchDoc = SearchDoc &
  Required<
    Pick<
      SearchDoc,
      'unitId' | 'projectionVersion' | 'sourceHash' | 'visibility'
    >
  >;

function hasProjectionMetadata(hit: SearchDoc): hit is ProjectedSearchDoc {
  return Boolean(
    hit.unitId && hit.projectionVersion && hit.sourceHash && hit.visibility
  );
}

function hasVectorProjectionMetadata(hit: DocChunkSimilarity) {
  return Boolean(hit.unitId && hit.visibility);
}

@Injectable()
export class DocumentRetrievalService {
  constructor(
    private readonly ac: PermissionAccess,
    private readonly indexer: IndexerService,
    @Inject(DOCUMENT_VECTOR_SEARCH)
    private readonly context: DocumentVectorSearch,
    private readonly models: Models
  ) {}

  async search(
    options: DocumentSearchContext,
    query: string,
    docIds: string[] | undefined,
    requestedLimit: number,
    signal?: AbortSignal
  ) {
    if (!options?.user || !options.workspace) {
      throw new Error('INVALID_SEARCH_CONTEXT');
    }
    const userId = options.user;
    const workspaceId = options.workspace;
    const limit = Math.min(requestedLimit, 20);
    const routeContext = {
      userId,
      byokLeaseId: options.byokLeaseId,
    };
    const [lexicalAttempt, vectorAttempt] = await Promise.allSettled([
      this.indexer
        .searchDocsByKeyword(userId, workspaceId, query, {
          limit: Math.max(limit * 3, 20),
          docIds,
        })
        .catch(error => {
          if (error instanceof SearchProviderUnavailable) return null;
          throw error;
        }),
      this.context.canEmbedding
        ? this.context.matchWorkspaceDocCandidates(
            workspaceId,
            query,
            Math.max(limit * 3, 20),
            docIds
          )
        : null,
    ]);
    if (signal?.aborted) throw new Error('SEARCH_ABORTED');
    const lexicalResult =
      lexicalAttempt.status === 'fulfilled' ? lexicalAttempt.value : null;
    const vectorResult =
      vectorAttempt.status === 'fulfilled' ? vectorAttempt.value : null;
    const lexical = lexicalResult
      ? await this.readable(
          userId,
          workspaceId,
          lexicalResult.filter(hasProjectionMetadata)
        )
      : [];
    const vectorScoped = (vectorResult ?? []).filter(
      candidate =>
        hasVectorProjectionMetadata(candidate) &&
        (!docIds || docIds.includes(candidate.docId))
    );
    const readableVector = vectorScoped.length
      ? await this.readable(userId, workspaceId, vectorScoped)
      : [];
    let vector = null;
    if (vectorResult !== null) {
      try {
        vector = await this.context.rerankWorkspaceDocs(
          workspaceId,
          query,
          readableVector,
          Math.max(limit * 3, 20),
          routeContext
        );
      } catch {
        vector = null;
      }
    }
    if (signal?.aborted) throw new Error('SEARCH_ABORTED');
    const metas = await this.models.doc.findMetas(
      (vector ?? []).map(candidate => ({
        workspaceId,
        docId: candidate.docId,
      })),
      { select: { title: true } }
    );
    const metaByDoc = new Map(
      metas
        .filter((meta): meta is NonNullable<typeof meta> => meta !== null)
        .map(meta => [meta.docId, meta])
    );

    const candidates = new Map<string, Candidate>();
    const merge = (
      hit: DocumentSearchHit,
      channel: 'lexical' | 'vector',
      rank: number
    ) => {
      const key = `${hit.docId}:${hit.unitId}`;
      const score = 1 / (60 + rank);
      const existing = candidates.get(key);
      if (existing) {
        existing.score += score;
        existing.channels.add(channel);
      } else {
        candidates.set(key, { ...hit, score, channels: new Set([channel]) });
      }
    };
    lexical.forEach((hit, index) =>
      merge(this.fromLexical(hit), 'lexical', index + 1)
    );
    vector?.forEach((hit, index) => {
      const meta = metaByDoc.get(hit.docId);
      merge(
        {
          docId: hit.docId,
          title: meta?.title ?? '',
          excerpt: hit.content,
          visibility: hit.visibility as DocVisibility,
          blockId: hit.blockId,
          elementId: hit.elementId,
          frameId: hit.frameId,
          score: 0,
          unitId: hit.unitId,
        },
        'vector',
        index + 1
      );
    });
    if (lexicalResult === null && vector === null) {
      throw new Error('SEARCH_UNAVAILABLE');
    }

    const perDoc = new Map<string, number>();
    const hits = [...candidates.values()]
      .sort(
        (left, right) =>
          right.score - left.score || left.unitId.localeCompare(right.unitId)
      )
      .filter(hit => {
        const count = perDoc.get(hit.docId) ?? 0;
        if (count >= 3) return false;
        perDoc.set(hit.docId, count + 1);
        return true;
      })
      .slice(0, limit)
      .map(({ channels: _, ...hit }) => hit);
    const hasLexical = lexicalResult !== null;
    const retrievalMode =
      hasLexical && vector ? 'hybrid' : hasLexical ? 'lexical' : 'vector';
    return {
      retrievalMode,
      degradedReason:
        retrievalMode === 'hybrid'
          ? undefined
          : lexicalResult
            ? 'VECTOR_UNAVAILABLE'
            : 'LEXICAL_UNAVAILABLE',
      hits,
    } as const;
  }

  private async readable<T extends { docId: string }>(
    userId: string,
    workspaceId: string,
    candidates: T[]
  ) {
    return (
      (await this.ac
        .user(userId)
        .workspace(workspaceId)
        .docs(candidates, 'Doc.Read')) ?? []
    );
  }

  private fromLexical(hit: ProjectedSearchDoc): DocumentSearchHit {
    return {
      docId: hit.docId,
      title: hit.title,
      excerpt: hit.highlight || '',
      visibility: hit.visibility as DocVisibility,
      blockId: hit.blockId,
      elementId: hit.elementId,
      frameId: hit.frameId,
      updatedAt: hit.updatedAt,
      score: 0,
      unitId: hit.unitId,
    };
  }
}
