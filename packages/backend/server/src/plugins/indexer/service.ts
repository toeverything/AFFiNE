import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

import {
  InternalServerError,
  InvalidIndexerInput,
  OnEvent,
  SearchProviderNotFound,
  SpaceAccessDenied,
  WorkspacePermissionNotFound,
} from '../../base';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { ServerFeature, ServerService } from '../../core/config';
import { Models } from '../../models';
import {
  type AggregateResult,
  buildSearchDocsInput,
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
    await this.syncFeature();
  }

  @OnEvent('config.changed.broadcast')
  async onConfigChanged({ updates }: Events['config.changed.broadcast']) {
    if (updates.indexer) await this.syncFeature();
  }

  private async syncFeature() {
    const status = (await this.runtime.searchStatus()) as { ready: boolean };
    if (status.ready) this.server.enableFeature(ServerFeature.Indexer);
    else this.server.disableFeature(ServerFeature.Indexer);
  }

  async search(actorUserId: string, workspaceId: string, input: SearchInput) {
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
    const result = this.unwrap<AggregateResult>(
      await this.runtime.aggregateAuthorized(actorUserId, workspaceId, input),
      workspaceId
    );
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

  async indexDoc(workspaceId: string, docId: string) {
    await this.runtime.indexSearchDocument(workspaceId, docId);
  }

  async deleteDoc(workspaceId: string, docId: string) {
    await this.runtime.deleteSearchDocument(workspaceId, docId);
  }

  async reconcileWorkspace(workspaceId: string) {
    await this.runtime.reconcileSearchWorkspace(workspaceId);
  }

  async deleteWorkspace(workspaceId: string) {
    await this.runtime.deleteSearchWorkspace(workspaceId);
  }

  async searchDocsByKeyword(
    actorUserId: string,
    workspaceId: string,
    keyword: string,
    options?: { limit?: number; docIds?: string[] }
  ): Promise<SearchDoc[]> {
    if (options?.docIds?.length === 0) return [];
    const result = await this.aggregate(
      actorUserId,
      workspaceId,
      buildSearchDocsInput(workspaceId, keyword, options)
    );
    const { docs, missingTitles, userIds } = collectSearchDocs(
      result,
      workspaceId
    );
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
        throw new SearchProviderNotFound();
      case 'permission_unavailable':
        throw new WorkspacePermissionNotFound({ spaceId: workspaceId });
      default:
        throw new InternalServerError();
    }
  }
}
