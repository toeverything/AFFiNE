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

import { canonicalizeDocumentIdentity } from '../../../native';
import { CurrentUser } from '../../auth';
import { BackendRuntimeProvider } from '../../backend-runtime';
import { PgWorkspaceDocStorageAdapter } from '../../doc';
import { PermissionAccess } from '../../permission';
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
    private readonly ac: PermissionAccess,
    private readonly runtime: BackendRuntimeProvider
  ) {}

  @ResolveField(() => [DocHistoryType])
  async histories(
    @CurrentUser() user: CurrentUser,
    @Parent() workspace: WorkspaceType,
    @Args('guid') guid: string,
    @Args({ name: 'before', type: () => GraphQLISODateTime, nullable: true })
    timestamp: Date = new Date(),
    @Args({ name: 'take', type: () => Int, nullable: true })
    take?: number
  ): Promise<DocHistoryType[]> {
    const docId = canonicalizeDocumentIdentity(guid, workspace.id);

    await this.ac.user(user.id).doc(docId).assert('Doc.History.Read');

    const histories = await this.workspace.listDocHistories(
      workspace.id,
      docId.docId,
      { before: timestamp.getTime(), limit: take }
    );

    return histories.map(history => {
      return {
        workspaceId: workspace.id,
        id: docId.docId,
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
    const docId = canonicalizeDocumentIdentity(guid, workspaceId);

    await this.runtime.executeDomainCommandV1({
      command: 'recover_doc',
      actorUserId: user.id,
      workspaceId: docId.workspaceId,
      docId: docId.docId,
      timestamp: timestamp.toISOString(),
    });

    return timestamp;
  }
}
