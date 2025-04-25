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

import { CurrentUser } from '../../auth';
import { PgWorkspaceDocStorageAdapter } from '../../doc';
import { AccessController } from '../../permission';
import { DocID } from '../../utils/doc';
import { WorkspaceType } from '../types';
import { EditorType } from './doc';

@ObjectType()
class DocHistoryType implements Partial<SnapshotHistory> {
  @Field()
  workspaceId!: string;

  @Field()
  id!: string;

  @Field(() => GraphQLISODateTime)
  timestamp!: Date;

  @Field(() => EditorType, { nullable: true })
  editor!: EditorType | null;
}

@Resolver(() => WorkspaceType)
export class DocHistoryResolver {
  constructor(
    private readonly workspace: PgWorkspaceDocStorageAdapter,
    private readonly ac: AccessController
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

    const histories = await this.workspace.listDocHistories(
      workspace.id,
      docId.guid,
      { before: timestamp.getTime(), limit: take }
    );

    return histories.map(history => {
      return {
        workspaceId: workspace.id,
        id: docId.guid,
        timestamp: new Date(history.timestamp),
        editor: history.editor,
      };
    });
  }

  @Mutation(() => Date)
  async recoverDoc(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('guid') guid: string,
    @Args({ name: 'timestamp', type: () => GraphQLISODateTime }) timestamp: Date
  ): Promise<Date> {
    const docId = new DocID(guid, workspaceId);

    await this.ac.user(user.id).doc(docId).assert('Doc.Update');

    await this.workspace.rollbackDoc(
      docId.workspace,
      docId.guid,
      timestamp.getTime(),
      user.id
    );

    return timestamp;
  }
}
