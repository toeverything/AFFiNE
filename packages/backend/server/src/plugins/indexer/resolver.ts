import { Args, Parent, ResolveField, Resolver } from '@nestjs/graphql';

import { CurrentUser } from '../../core/auth';
import { PermissionAccess } from '../../core/permission';
import { UserType } from '../../core/user';
import { WorkspaceType } from '../../core/workspaces';
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
    private readonly ac: PermissionAccess
  ) {}

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
      nodes: result.nodes,
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
    return {
      buckets: result.buckets,
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

    return docs;
  }
}
