import { Args, Parent, ResolveField, Resolver } from '@nestjs/graphql';

import { CurrentUser } from '../../core/auth';
import { DocReader } from '../../core/doc';
import { PermissionAccess } from '../../core/permission';
import { UserType } from '../../core/user';
import { WorkspaceType } from '../../core/workspaces';
import type { SearchNodeWithMeta } from './result';
import { IndexerService } from './service';
import {
  AggregateInput,
  AggregateResultObjectType,
  SearchDocObjectType,
  SearchDocsInput,
  SearchInput,
  SearchResultObjectType,
} from './types';

@Resolver(() => WorkspaceType)
export class IndexerResolver {
  constructor(
    private readonly indexer: IndexerService,
    private readonly ac: PermissionAccess,
    private readonly docReader: DocReader
  ) {}

  private async logicalDocIds(workspaceId: string) {
    const aliases = await this.docReader.getDocIdAliases(workspaceId);
    return new Map(
      [...aliases].map(([logical, physical]) => [physical, logical])
    );
  }

  private displayNodes(
    nodes: SearchNodeWithMeta[],
    aliases: Map<string, string>
  ) {
    return nodes.map(node => ({
      ...node,
      fields: {
        ...node.fields,
        ...(node.fields.docId
          ? {
              docId: node.fields.docId.map(id =>
                typeof id === 'string' ? (aliases.get(id) ?? id) : id
              ),
            }
          : {}),
      },
      _source: {
        ...node._source,
        docId: aliases.get(node._source.docId) ?? node._source.docId,
      },
    }));
  }

  @ResolveField(() => SearchResultObjectType, {
    description: 'Search a specific table',
  })
  async search(
    @CurrentUser() me: UserType,
    @Parent() workspace: WorkspaceType,
    @Args('input') input: SearchInput
  ): Promise<SearchResultObjectType> {
    // currentUser can read the workspace
    await this.ac.user(me.id).workspace(workspace.id).assert('Workspace.Read');
    const result = await this.indexer.search(me.id, workspace.id, input);
    return {
      nodes: this.displayNodes(
        result.nodes,
        await this.logicalDocIds(workspace.id)
      ),
      pagination: {
        count: result.nodes.length,
        hasMore: Boolean(result.nextCursor),
        nextCursor: result.nextCursor,
      },
    };
  }

  @ResolveField(() => AggregateResultObjectType, {
    description: 'Search a specific table with aggregate',
  })
  async aggregate(
    @CurrentUser() me: UserType,
    @Parent() workspace: WorkspaceType,
    @Args('input') input: AggregateInput
  ): Promise<AggregateResultObjectType> {
    // currentUser can read the workspace
    await this.ac.user(me.id).workspace(workspace.id).assert('Workspace.Read');
    const result = await this.indexer.aggregate(me.id, workspace.id, input);
    const aliases = await this.logicalDocIds(workspace.id);
    return {
      buckets: result.buckets.map(bucket => ({
        ...bucket,
        key:
          input.field === 'docId' || input.field === 'doc_id'
            ? (aliases.get(bucket.key) ?? bucket.key)
            : bucket.key,
        hits: {
          ...bucket.hits,
          nodes: this.displayNodes(bucket.hits.nodes, aliases),
        },
      })),
      pagination: {
        count: result.buckets.length,
        hasMore: result.hasMore,
      },
    };
  }

  @ResolveField(() => [SearchDocObjectType], {
    description: 'Search docs by keyword',
  })
  async searchDocs(
    @CurrentUser() me: UserType,
    @Parent() workspace: WorkspaceType,
    @Args('input') input: SearchDocsInput
  ): Promise<SearchDocObjectType[]> {
    const docs = await this.indexer.searchDocsByKeyword(
      me.id,
      workspace.id,
      input.keyword,
      { limit: input.limit }
    );

    const aliases = await this.logicalDocIds(workspace.id);
    return docs.map(doc => ({
      ...doc,
      docId: aliases.get(doc.docId) ?? doc.docId,
    }));
  }
}
