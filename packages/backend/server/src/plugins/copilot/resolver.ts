import {
  Args,
  Field,
  ID,
  InputType,
  Mutation,
  ObjectType,
  Parent,
  registerEnumType,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';

import { CurrentUser } from '../../core/auth';
import { UserType } from '../../core/user';
import { PermissionService } from '../../core/workspaces/permission';
import { ChatSessionService, ListHistoriesOptions } from './session';
import {
  type AvailableModel,
  AvailableModels,
  type ChatHistory,
  type ChatMessage,
} from './types';

registerEnumType(AvailableModels, { name: 'CopilotModel' });

@ObjectType('Copilot')
export class CopilotType {
  @Field(() => ID)
  workspaceId!: string;
}

@InputType()
class CreateChatSessionInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => String)
  docId!: string;

  @Field(() => Boolean)
  action!: boolean;

  @Field(() => String)
  model!: AvailableModel;

  @Field(() => String)
  promptName!: string;
}

@InputType()
class QueryChatHistoriesInput implements Partial<ListHistoriesOptions> {
  @Field(() => Boolean, { nullable: true })
  action: boolean | undefined;

  @Field(() => Number, { nullable: true })
  limit: number | undefined;

  @Field(() => Number, { nullable: true })
  skip: number | undefined;

  @Field(() => String, { nullable: true })
  sessionId: string | undefined;
}

@ObjectType('ChatMessage')
class ChatMessageType implements Partial<ChatMessage> {
  @Field(() => String)
  role!: 'system' | 'assistant' | 'user';

  @Field(() => String)
  content!: string;

  @Field(() => [String], { nullable: true })
  attachments!: string[];
}

@ObjectType('CopilotHistories')
class CopilotHistoriesType implements Partial<ChatHistory> {
  @Field(() => String)
  sessionId!: string;

  @Field(() => Number)
  tokens!: number;

  @Field(() => [ChatMessageType])
  messages!: ChatMessageType[];
}

@Resolver(() => CopilotType)
export class CopilotResolver {
  constructor(
    private readonly permissions: PermissionService,
    private readonly chatSession: ChatSessionService
  ) {}

  @ResolveField(() => [String], {
    description: 'Get the session list of chats in the workspace',
    complexity: 2,
  })
  async chats(
    @Parent() copilot: CopilotType,
    @CurrentUser() user: CurrentUser
  ) {
    return await this.chatSession.listSessions(user.id, copilot.workspaceId);
  }

  @ResolveField(() => [String], {
    description: 'Get the session list of actions in the workspace',
    complexity: 2,
  })
  async actions(
    @Parent() copilot: CopilotType,
    @CurrentUser() user: CurrentUser
  ) {
    return await this.chatSession.listSessions(user.id, copilot.workspaceId, {
      action: true,
    });
  }

  @ResolveField(() => [CopilotHistoriesType], {})
  async histories(
    @Parent() copilot: CopilotType,
    @CurrentUser() user: CurrentUser,
    @Args('docId', { nullable: true }) docId?: string,
    @Args({
      name: 'options',
      type: () => QueryChatHistoriesInput,
      nullable: true,
    })
    options?: QueryChatHistoriesInput
  ) {
    const workspaceId = copilot.workspaceId;
    if (docId) {
      await this.permissions.checkPagePermission(workspaceId, docId, user.id);
    } else {
      await this.permissions.checkWorkspace(workspaceId, user.id);
    }

    return await this.chatSession.listHistories(workspaceId, docId, options);
  }

  @Mutation(() => String, {
    description: 'Create a chat session',
  })
  async createCopilotSession(
    @CurrentUser() user: CurrentUser,
    @Args({ name: 'options', type: () => CreateChatSessionInput })
    options: CreateChatSessionInput
  ) {
    const session = await this.chatSession.create({
      ...options,
      // todo: force user to be logged in
      userId: user?.id ?? '',
    });
    return session;
  }
}

@Resolver(() => UserType)
export class UserCopilotResolver {
  constructor(private readonly permissions: PermissionService) {}

  @ResolveField(() => CopilotType)
  async copilot(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string
  ) {
    await this.permissions.checkWorkspace(workspaceId, user.id);
    return { workspaceId };
  }
}
