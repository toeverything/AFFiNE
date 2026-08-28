import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

import {
  InternalServerError,
  InvalidIndexerInput,
  OnEvent,
  SearchIndexFailed,
  SearchIndexNotReady,
  SearchPermissionSyncing,
  SearchProviderUnavailable,
  SpaceAccessDenied,
} from '../../base';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { ServerFeature, ServerService } from '../../core/config';
import { Models } from '../../models';
import {
  type AggregateResult,
  buildBasicSearchDocsInput,
  buildSearchDocsInput,
  collectBasicSearchDocs,
  collectSearchDocs,
  formatSearchNodes,
  type SearchNode,
} from './result';
import type { AggregateInput, SearchDoc, SearchInput } from './types';

type SearchResult = {
  total: number;
  nodes: SearchNode[];
  nextCursor?: string;
};

type SearchOperationOutput = {
  ok: boolean;
  value?: unknown;
  errorCode?: string;
};

@Injectable()
export class IndexerService implements OnApplicationBootstrap {
  constructor(
    private readonly runtime: BackendRuntimeProvider,
    private readonly models: Models,
    private readonly server: ServerService
  ) {}

  async onApplicationBootstrap() {
    this.syncFeature();
  }

  @OnEvent('config.changed.broadcast')
  async onConfigChanged({ updates }: Events['config.changed.broadcast']) {
    if (updates.indexer) this.syncFeature();
  }

  private syncFeature() {
    if (this.server.getConfig().indexer.enabled) {
      this.server.enableFeature(ServerFeature.Indexer);
    } else {
      this.server.disableFeature(ServerFeature.Indexer);
    }
  }

  async search(actorUserId: string, workspaceId: string, input: SearchInput) {
    this.syncFeature();
    const result = this.unwrap<SearchResult>(
      await this.runtime.searchAuthorized(actorUserId, workspaceId, input),
      workspaceId
    );
    return { ...result, nodes: formatSearchNodes(result.nodes) };
  }

  async aggregate(
    actorUserId: string,
    workspaceId: string,
    input: AggregateInput
  ) {
    this.syncFeature();
    const result = this.unwrap<AggregateResult>(
      await this.runtime.aggregateAuthorized(actorUserId, workspaceId, input),
      workspaceId
    );
    return this.formatAggregate(result);
  }

  private formatAggregate(result: AggregateResult) {
    return {
      ...result,
      buckets: result.buckets.map(bucket => ({
        ...bucket,
        hits: {
          ...bucket.hits,
          nodes: formatSearchNodes(bucket.hits.nodes),
        },
      })),
    };
  }

  async searchDocsByKeyword(
    actorUserId: string,
    workspaceId: string,
    keyword: string,
    options?: { limit?: number; docIds?: string[] }
  ): Promise<SearchDoc[]> {
    this.syncFeature();
    if (options?.limit !== undefined && options.limit <= 0) {
      throw new InvalidIndexerInput({
        reason: 'searchDocs limit must be positive',
      });
    }
    if (options?.docIds?.length === 0) return [];
    const aggregateOutput = await this.runtime.aggregateAuthorized(
      actorUserId,
      workspaceId,
      buildSearchDocsInput(workspaceId, keyword, options)
    );
    const collected =
      !aggregateOutput.ok && aggregateOutput.errorCode === 'unsupported_query'
        ? collectBasicSearchDocs(
            await this.search(
              actorUserId,
              workspaceId,
              buildBasicSearchDocsInput(workspaceId, keyword, options)
            ),
            workspaceId,
            options?.limit ?? 20
          )
        : collectSearchDocs(
            this.formatAggregate(
              this.unwrap<AggregateResult>(aggregateOutput, workspaceId)
            ),
            workspaceId
          );
    const { docs, missingTitles, userIds } = collected;
    if (missingTitles.length > 0) {
      const metas = await this.models.doc.findMetas(missingTitles, {
        select: { title: true },
      });
      const titles = new Map(
        metas.flatMap(meta =>
          meta?.title ? [[meta.docId, meta.title] as const] : []
        )
      );
      for (const doc of docs) {
        if (!doc.title) doc.title = titles.get(doc.docId) ?? '';
      }
    }
    const users = await this.models.user.getPublicUsersMap(userIds);
    for (const doc of docs) {
      doc.createdByUser = users.get(doc.createdByUserId);
      doc.updatedByUser = users.get(doc.updatedByUserId);
    }
    return docs;
  }

  private unwrap<T>(output: SearchOperationOutput, workspaceId: string): T {
    if (output.ok) return output.value as T;
    switch (output.errorCode) {
      case 'workspace_denied':
        throw new SpaceAccessDenied({ spaceId: workspaceId });
      case 'invalid_request':
      case 'unsupported_query':
        throw new InvalidIndexerInput({ reason: output.errorCode });
      case 'provider_unavailable':
        throw new SearchProviderUnavailable();
      case 'index_not_ready':
        throw new SearchIndexNotReady({ spaceId: workspaceId });
      case 'permission_syncing':
        throw new SearchPermissionSyncing();
      case 'index_failed':
        throw new SearchIndexFailed({
          diagnosticId: 'search_workspace_reconcile_failed',
        });
      default:
        throw new InternalServerError();
    }
  }
}
