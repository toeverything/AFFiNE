import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Args,
  Field,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Parent,
  PartialType,
  PickType,
  Query,
  registerEnumType,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { SafeIntResolver } from 'graphql-scalars';

import { PaginationInput, URLHelper } from '../../../base';
import { PageInfo } from '../../../base/graphql/pagination';
import {
  Feature,
  Models,
  WorkspaceFeatureName,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from '../../../models';
import { Admin } from '../../common';
import { WorkspaceUserType } from '../../user';
import { TimeWindow } from './analytics-types';

enum AdminWorkspaceSort {
  CreatedAt = 'CreatedAt',
  SnapshotSize = 'SnapshotSize',
  BlobCount = 'BlobCount',
  BlobSize = 'BlobSize',
  SnapshotCount = 'SnapshotCount',
  MemberCount = 'MemberCount',
  PublicPageCount = 'PublicPageCount',
}

registerEnumType(AdminWorkspaceSort, {
  name: 'AdminWorkspaceSort',
});

enum AdminSharedLinksOrder {
  UpdatedAtDesc = 'UpdatedAtDesc',
  PublishedAtDesc = 'PublishedAtDesc',
  ViewsDesc = 'ViewsDesc',
}

registerEnumType(AdminSharedLinksOrder, {
  name: 'AdminSharedLinksOrder',
});

@InputType()
class ListWorkspaceInput {
  @Field(() => Int, { defaultValue: 20 })
  first!: number;

  @Field(() => Int, { defaultValue: 0 })
  skip!: number;

  @Field(() => String, { nullable: true })
  keyword?: string;

  @Field(() => [Feature], { nullable: true })
  features?: WorkspaceFeatureName[];

  @Field(() => AdminWorkspaceSort, { nullable: true })
  orderBy?: AdminWorkspaceSort;

  @Field({ nullable: true })
  public?: boolean;

  @Field({ nullable: true })
  enableAi?: boolean;

  @Field({ nullable: true })
  enableSharing?: boolean;

  @Field({ nullable: true })
  enableUrlPreview?: boolean;

  @Field({ nullable: true })
  enableDocEmbedding?: boolean;
}

@ObjectType()
class AdminWorkspaceMember {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field()
  email!: string;

  @Field(() => String, { nullable: true })
  avatarUrl?: string | null;

  @Field(() => WorkspaceRole)
  role!: WorkspaceRole;

  @Field(() => WorkspaceMemberStatus)
  status!: WorkspaceMemberStatus;
}

@ObjectType()
class AdminWorkspaceSharedLink {
  @Field()
  docId!: string;

  @Field(() => String, { nullable: true })
  title?: string | null;

  @Field(() => Date, { nullable: true })
  publishedAt?: Date | null;
}

@InputType()
class AdminDashboardInput {
  @Field(() => String, { nullable: true, defaultValue: 'UTC' })
  timezone?: string;

  @Field(() => Int, { nullable: true, defaultValue: 30 })
  storageHistoryDays?: number;

  @Field(() => Int, { nullable: true, defaultValue: 48 })
  syncHistoryHours?: number;

  @Field(() => Int, { nullable: true, defaultValue: 28 })
  sharedLinkWindowDays?: number;
}

@ObjectType()
class AdminDashboardMinutePoint {
  @Field(() => Date)
  minute!: Date;

  @Field(() => Int)
  activeUsers!: number;
}

@ObjectType()
class AdminDashboardValueDayPoint {
  @Field(() => Date)
  date!: Date;

  @Field(() => SafeIntResolver)
  value!: number;
}

@ObjectType()
class AdminSharedLinkTopItem {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => String)
  docId!: string;

  @Field(() => String, { nullable: true })
  title?: string | null;

  @Field(() => String)
  shareUrl!: string;

  @Field(() => Date, { nullable: true })
  publishedAt?: Date | null;

  @Field(() => SafeIntResolver)
  views!: number;

  @Field(() => SafeIntResolver)
  uniqueViews!: number;

  @Field(() => SafeIntResolver)
  guestViews!: number;

  @Field(() => Date, { nullable: true })
  lastAccessedAt?: Date | null;
}

@ObjectType()
class AdminDashboard {
  @Field(() => Int)
  syncActiveUsers!: number;

  @Field(() => [AdminDashboardMinutePoint])
  syncActiveUsersTimeline!: AdminDashboardMinutePoint[];

  @Field(() => TimeWindow)
  syncWindow!: TimeWindow;

  @Field(() => SafeIntResolver)
  copilotConversations!: number;

  @Field(() => SafeIntResolver)
  workspaceStorageBytes!: number;

  @Field(() => SafeIntResolver)
  blobStorageBytes!: number;

  @Field(() => [AdminDashboardValueDayPoint])
  workspaceStorageHistory!: AdminDashboardValueDayPoint[];

  @Field(() => [AdminDashboardValueDayPoint])
  blobStorageHistory!: AdminDashboardValueDayPoint[];

  @Field(() => TimeWindow)
  storageWindow!: TimeWindow;

  @Field(() => [AdminSharedLinkTopItem])
  topSharedLinks!: AdminSharedLinkTopItem[];

  @Field(() => TimeWindow)
  topSharedLinksWindow!: TimeWindow;

  @Field(() => Date)
  generatedAt!: Date;
}

@InputType()
class AdminAllSharedLinksFilterInput {
  @Field(() => String, { nullable: true })
  keyword?: string;

  @Field(() => String, { nullable: true })
  workspaceId?: string;

  @Field(() => Date, { nullable: true })
  updatedAfter?: Date;

  @Field(() => AdminSharedLinksOrder, {
    nullable: true,
    defaultValue: AdminSharedLinksOrder.UpdatedAtDesc,
  })
  orderBy?: AdminSharedLinksOrder;

  @Field(() => Int, { nullable: true, defaultValue: 28 })
  analyticsWindowDays?: number;

  @Field(() => Boolean, { nullable: true, defaultValue: false })
  includeTotal?: boolean;
}

@ObjectType()
class AdminAllSharedLink {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => String)
  docId!: string;

  @Field(() => String, { nullable: true })
  title?: string | null;

  @Field(() => Date, { nullable: true })
  publishedAt?: Date | null;

  @Field(() => Date, { nullable: true })
  docUpdatedAt?: Date | null;

  @Field(() => String, { nullable: true })
  workspaceOwnerId?: string | null;

  @Field(() => String, { nullable: true })
  lastUpdaterId?: string | null;

  @Field(() => String)
  shareUrl!: string;

  @Field(() => SafeIntResolver, { nullable: true })
  views?: number | null;

  @Field(() => SafeIntResolver, { nullable: true })
  uniqueViews?: number | null;

  @Field(() => SafeIntResolver, { nullable: true })
  guestViews?: number | null;

  @Field(() => Date, { nullable: true })
  lastAccessedAt?: Date | null;
}

@ObjectType()
class AdminAllSharedLinkEdge {
  @Field(() => String)
  cursor!: string;

  @Field(() => AdminAllSharedLink)
  node!: AdminAllSharedLink;
}

@ObjectType()
class PaginatedAdminAllSharedLink {
  @Field(() => [AdminAllSharedLinkEdge])
  edges!: AdminAllSharedLinkEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field(() => Int, { nullable: true })
  totalCount?: number;

  @Field(() => TimeWindow)
  analyticsWindow!: TimeWindow;
}

@ObjectType()
export class AdminWorkspace {
  @Field()
  id!: string;

  @Field()
  public!: boolean;

  @Field()
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  name?: string | null;

  @Field(() => String, { nullable: true })
  avatarKey?: string | null;

  @Field()
  enableAi!: boolean;

  @Field()
  enableSharing!: boolean;

  @Field()
  enableUrlPreview!: boolean;

  @Field()
  enableDocEmbedding!: boolean;

  @Field(() => [Feature])
  features!: WorkspaceFeatureName[];

  @Field(() => WorkspaceUserType, { nullable: true })
  owner?: WorkspaceUserType | null;

  @Field(() => Int)
  memberCount!: number;

  @Field(() => Int)
  publicPageCount!: number;

  @Field(() => Int)
  snapshotCount!: number;

  @Field(() => SafeIntResolver)
  snapshotSize!: number;

  @Field(() => Int)
  blobCount!: number;

  @Field(() => SafeIntResolver)
  blobSize!: number;

  @Field(() => [AdminWorkspaceSharedLink])
  sharedLinks!: AdminWorkspaceSharedLink[];
}

@InputType()
class AdminUpdateWorkspaceInput extends PartialType(
  PickType(AdminWorkspace, [
    'public',
    'enableAi',
    'enableSharing',
    'enableUrlPreview',
    'enableDocEmbedding',
    'name',
    'avatarKey',
  ] as const),
  InputType
) {
  @Field()
  id!: string;

  @Field(() => [Feature], { nullable: true })
  features?: WorkspaceFeatureName[];
}

@Injectable()
@Admin()
@Resolver(() => AdminWorkspace)
export class AdminWorkspaceResolver {
  constructor(
    private readonly models: Models,
    private readonly url: URLHelper
  ) {}

  private assertCloudOnly() {
    if (env.selfhosted) {
      throw new NotFoundException();
    }
  }

  @Query(() => [AdminWorkspace], {
    description: 'List workspaces for admin',
  })
  async adminWorkspaces(
    @Args('filter', { type: () => ListWorkspaceInput })
    filter: ListWorkspaceInput
  ) {
    this.assertCloudOnly();
    const { rows } = await this.models.workspace.adminListWorkspaces({
      first: filter.first,
      skip: filter.skip,
      keyword: filter.keyword,
      features: filter.features,
      order: this.mapSort(filter.orderBy),
      flags: {
        public: filter.public ?? undefined,
        enableAi: filter.enableAi ?? undefined,
        enableSharing: filter.enableSharing ?? undefined,
        enableUrlPreview: filter.enableUrlPreview ?? undefined,
        enableDocEmbedding: filter.enableDocEmbedding ?? undefined,
      },
      includeTotal: false,
    });
    return rows;
  }

  @Query(() => Int, { description: 'Workspaces count for admin' })
  async adminWorkspacesCount(
    @Args('filter', { type: () => ListWorkspaceInput })
    filter: ListWorkspaceInput
  ) {
    this.assertCloudOnly();
    const total = await this.models.workspace.adminCountWorkspaces({
      keyword: filter.keyword,
      features: filter.features,
      flags: {
        public: filter.public ?? undefined,
        enableAi: filter.enableAi ?? undefined,
        enableSharing: filter.enableSharing ?? undefined,
        enableUrlPreview: filter.enableUrlPreview ?? undefined,
        enableDocEmbedding: filter.enableDocEmbedding ?? undefined,
      },
    });
    return total;
  }

  @Query(() => AdminWorkspace, {
    description: 'Get workspace detail for admin',
    nullable: true,
  })
  async adminWorkspace(@Args('id') id: string) {
    this.assertCloudOnly();
    const { rows } = await this.models.workspace.adminListWorkspaces({
      first: 1,
      skip: 0,
      keyword: id,
      order: 'createdAt',
      includeTotal: false,
    });
    const row = rows.find(r => r.id === id);
    if (!row) {
      return null;
    }
    return row;
  }

  @Query(() => AdminDashboard, {
    description: 'Get aggregated dashboard metrics for admin panel',
  })
  async adminDashboard(
    @Args('input', { nullable: true, type: () => AdminDashboardInput })
    input?: AdminDashboardInput
  ) {
    this.assertCloudOnly();
    const dashboard = await this.models.workspaceAnalytics.adminGetDashboard({
      timezone: input?.timezone,
      storageHistoryDays: input?.storageHistoryDays,
      syncHistoryHours: input?.syncHistoryHours,
      sharedLinkWindowDays: input?.sharedLinkWindowDays,
    });

    return {
      ...dashboard,
      topSharedLinks: dashboard.topSharedLinks.map(link => ({
        ...link,
        shareUrl: this.url.link(`/workspace/${link.workspaceId}/${link.docId}`),
      })),
    };
  }

  @Query(() => PaginatedAdminAllSharedLink, {
    description: 'List all shared links across workspaces for admin panel',
  })
  async adminAllSharedLinks(
    @Args('pagination', PaginationInput.decode) pagination: PaginationInput,
    @Args('filter', {
      nullable: true,
      type: () => AdminAllSharedLinksFilterInput,
    })
    filter?: AdminAllSharedLinksFilterInput
  ) {
    this.assertCloudOnly();
    const result =
      await this.models.workspaceAnalytics.adminPaginateAllSharedLinks({
        keyword: filter?.keyword,
        workspaceId: filter?.workspaceId,
        updatedAfter: filter?.updatedAfter,
        orderBy:
          filter?.orderBy === AdminSharedLinksOrder.PublishedAtDesc
            ? 'PublishedAtDesc'
            : filter?.orderBy === AdminSharedLinksOrder.ViewsDesc
              ? 'ViewsDesc'
              : 'UpdatedAtDesc',
        analyticsWindowDays: filter?.analyticsWindowDays,
        includeTotal: filter?.includeTotal,
        pagination,
      });

    return {
      ...result,
      edges: result.edges.map(edge => ({
        ...edge,
        node: {
          ...edge.node,
          shareUrl: this.url.link(
            `/workspace/${edge.node.workspaceId}/${edge.node.docId}`
          ),
        },
      })),
    };
  }

  @ResolveField(() => [AdminWorkspaceMember], {
    description: 'Members of workspace',
  })
  async members(
    @Parent() workspace: AdminWorkspace,
    @Args('skip', { type: () => Int, nullable: true }) skip: number | null,
    @Args('take', { type: () => Int, nullable: true }) take: number | null,
    @Args('query', { type: () => String, nullable: true }) query: string | null
  ): Promise<AdminWorkspaceMember[]> {
    const workspaceId = workspace.id;
    const pagination = {
      offset: skip ?? 0,
      first: take ?? 20,
      after: undefined,
    };

    if (query) {
      const list = await this.models.workspaceUser.search(
        workspaceId,
        query,
        pagination
      );
      return list.map(({ user, status, type }) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: type,
        status,
      }));
    }

    const [list] = await this.models.workspaceUser.paginate(
      workspaceId,
      pagination
    );
    return list.map(({ user, status, type }) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: type,
      status,
    }));
  }

  @ResolveField(() => [AdminWorkspaceSharedLink], {
    description: 'Shared links of workspace',
  })
  async sharedLinks(@Parent() workspace: AdminWorkspace) {
    const publicDocs = await this.models.doc.findPublics(workspace.id, 'desc');
    return publicDocs.map(doc => ({
      docId: doc.docId,
      title: doc.title,
      publishedAt: doc.publishedAt ?? null,
    }));
  }

  @Mutation(() => AdminWorkspace, {
    description: 'Update workspace flags and features for admin',
    nullable: true,
  })
  async adminUpdateWorkspace(
    @Args('input', { type: () => AdminUpdateWorkspaceInput })
    input: AdminUpdateWorkspaceInput
  ) {
    this.assertCloudOnly();
    const { id, features, ...updates } = input;

    if (Object.keys(updates).length) {
      await this.models.workspace.update(id, updates);
    }

    if (features) {
      const current = await this.models.workspaceFeature.list(id);
      const toAdd = features.filter(feature => !current.includes(feature));
      const toRemove = current.filter(feature => !features.includes(feature));

      await Promise.all([
        ...toAdd.map(feature =>
          this.models.workspaceFeature.add(id, feature, 'admin panel update')
        ),
        ...toRemove.map(feature =>
          this.models.workspaceFeature.remove(id, feature)
        ),
      ]);
    }

    const { rows } = await this.models.workspace.adminListWorkspaces({
      first: 1,
      skip: 0,
      keyword: id,
      order: 'createdAt',
      includeTotal: false,
    });
    const row = rows.find(r => r.id === id);
    if (!row) {
      return null;
    }
    return row;
  }

  private mapSort(orderBy?: AdminWorkspaceSort) {
    switch (orderBy) {
      case AdminWorkspaceSort.SnapshotSize:
        return 'snapshotSize';
      case AdminWorkspaceSort.BlobCount:
        return 'blobCount';
      case AdminWorkspaceSort.BlobSize:
        return 'blobSize';
      case AdminWorkspaceSort.SnapshotCount:
        return 'snapshotCount';
      case AdminWorkspaceSort.MemberCount:
        return 'memberCount';
      case AdminWorkspaceSort.PublicPageCount:
        return 'publicPageCount';
      case AdminWorkspaceSort.CreatedAt:
      default:
        return 'createdAt';
    }
  }
}
