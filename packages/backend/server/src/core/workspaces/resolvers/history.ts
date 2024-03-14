import { UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  GraphQLISODateTime,
  Int,
  Mutation,
  ObjectType,
  Parent,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import type { SnapshotHistory } from '@prisma/client';

import { CloudThrottlerGuard } from '../../../fundamentals';
import { CurrentUser } from '../../auth';
import { DocHistoryManager } from '../../doc';
import { DocID } from '../../utils/doc';
import { PermissionService } from '../permission';
import { Permission, WorkspaceType } from '../types';

@ObjectType()
class DocHistoryType implements Partial<SnapshotHistory> {
  @Field()
  workspaceId!: string;

  @Field()
  id!: string;

  @Field(() => GraphQLISODateTime)
  timestamp!: Date;
}

@UseGuards(CloudThrottlerGuard)
@Resolver(() => WorkspaceType)
export class DocHistoryResolver {
  constructor(
    private readonly historyManager: DocHistoryManager,
    private readonly permission: PermissionService
  ) {}

  @ResolveField(() => [DocHistoryType])
  async histories(
    @Parent() workspace: WorkspaceType,
    @Args('guid') guid: string,
    @Args({ name: 'before', type: () => GraphQLISODateTime, nullable: true })
    timestamp: Date = new Date(),
    @Args({ name: 'take', type: () => Int, nullable: true })
    take?: number
  ): Promise<DocHistoryType[]> {
    const docId = new DocID(guid, workspace.id);

    if (docId.isWorkspace) {
      throw new Error('Invalid guid for listing doc histories.');
    }

    return this.historyManager
      .list(workspace.id, docId.guid, timestamp, take)
      .then(rows =>
        rows.map(({ timestamp }) => {
          return {
            workspaceId: workspace.id,
            id: docId.guid,
            timestamp,
          };
        })
      );
  }

  @Mutation(() => Date)
  async recoverDoc(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('guid') guid: string,
    @Args({ name: 'timestamp', type: () => GraphQLISODateTime }) timestamp: Date
  ): Promise<Date> {
    const docId = new DocID(guid, workspaceId);

    if (docId.isWorkspace) {
      throw new Error('Invalid guid for recovering doc from history.');
    }

    await this.permission.checkPagePermission(
      docId.workspace,
      docId.guid,
      user.id,
      Permission.Write
    );

    return this.historyManager.recover(docId.workspace, docId.guid, timestamp);
  }
}
