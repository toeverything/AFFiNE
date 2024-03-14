import { BadRequestException, UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  Mutation,
  ObjectType,
  Parent,
  registerEnumType,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import {
  PrismaClient,
  type WorkspacePage as PrismaWorkspacePage,
} from '@prisma/client';

import { CloudThrottlerGuard } from '../../../fundamentals';
import { CurrentUser } from '../../auth';
import { DocID } from '../../utils/doc';
import { PermissionService, PublicPageMode } from '../permission';
import { Permission, WorkspaceType } from '../types';

registerEnumType(PublicPageMode, {
  name: 'PublicPageMode',
  description: 'The mode which the public page default in',
});

@ObjectType()
class WorkspacePage implements Partial<PrismaWorkspacePage> {
  @Field(() => String, { name: 'id' })
  pageId!: string;

  @Field()
  workspaceId!: string;

  @Field(() => PublicPageMode)
  mode!: PublicPageMode;

  @Field()
  public!: boolean;
}

@UseGuards(CloudThrottlerGuard)
@Resolver(() => WorkspaceType)
export class PagePermissionResolver {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly permission: PermissionService
  ) {}

  /**
   * @deprecated
   */
  @ResolveField(() => [String], {
    description: 'Shared pages of workspace',
    complexity: 2,
    deprecationReason: 'use WorkspaceType.publicPages',
  })
  async sharedPages(@Parent() workspace: WorkspaceType) {
    const data = await this.prisma.workspacePage.findMany({
      where: {
        workspaceId: workspace.id,
        public: true,
      },
    });

    return data.map(row => row.pageId);
  }

  @ResolveField(() => [WorkspacePage], {
    description: 'Public pages of a workspace',
    complexity: 2,
  })
  async publicPages(@Parent() workspace: WorkspaceType) {
    return this.prisma.workspacePage.findMany({
      where: {
        workspaceId: workspace.id,
        public: true,
      },
    });
  }

  /**
   * @deprecated
   */
  @Mutation(() => Boolean, {
    name: 'sharePage',
    deprecationReason: 'renamed to publicPage',
  })
  async deprecatedSharePage(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('pageId') pageId: string
  ) {
    await this.publishPage(user, workspaceId, pageId, PublicPageMode.Page);
    return true;
  }

  @Mutation(() => WorkspacePage)
  async publishPage(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('pageId') pageId: string,
    @Args({
      name: 'mode',
      type: () => PublicPageMode,
      nullable: true,
      defaultValue: PublicPageMode.Page,
    })
    mode: PublicPageMode
  ) {
    const docId = new DocID(pageId, workspaceId);

    if (docId.isWorkspace) {
      throw new BadRequestException('Expect page not to be workspace');
    }

    await this.permission.checkWorkspace(
      docId.workspace,
      user.id,
      Permission.Read
    );

    return this.permission.publishPage(docId.workspace, docId.guid, mode);
  }

  /**
   * @deprecated
   */
  @Mutation(() => Boolean, {
    name: 'revokePage',
    deprecationReason: 'use revokePublicPage',
  })
  async deprecatedRevokePage(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('pageId') pageId: string
  ) {
    await this.revokePublicPage(user, workspaceId, pageId);
    return true;
  }

  @Mutation(() => WorkspacePage)
  async revokePublicPage(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('pageId') pageId: string
  ) {
    const docId = new DocID(pageId, workspaceId);

    if (docId.isWorkspace) {
      throw new BadRequestException('Expect page not to be workspace');
    }

    await this.permission.checkWorkspace(
      docId.workspace,
      user.id,
      Permission.Read
    );

    const isPublic = await this.permission.isPublicPage(
      docId.workspace,
      docId.guid
    );

    if (!isPublic) {
      throw new BadRequestException('Page is not public');
    }

    return this.permission.revokePublicPage(docId.workspace, docId.guid);
  }
}
