import { BadRequestException, Logger } from '@nestjs/common';
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
import { GraphQLJSON, SafeIntResolver } from 'graphql-scalars';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';

import { CurrentUser } from '../../core/auth';
import { UserType } from '../../core/user';
import { PermissionService } from '../../core/workspaces/permission';
import {
  FileUpload,
  MutexService,
  TooManyRequestsException,
} from '../../fundamentals';
import { ChatSessionService } from './session';
import { CopilotStorage } from './storage';
import {
  AvailableModels,
  type ChatHistory,
  type ChatMessage,
  type ListHistoriesOptions,
  SubmittedMessage,
} from './types';

registerEnumType(AvailableModels, { name: 'CopilotModel' });

export const COPILOT_LOCKER = 'copilot';

// ================== Input Types ==================

@InputType()
class CreateChatSessionInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => String)
  docId!: string;

  @Field(() => String, {
    description: 'The prompt name to use for the session',
  })
  promptName!: string;
}

@InputType()
class CreateChatMessageInput implements Omit<SubmittedMessage, 'content'> {
  @Field(() => String)
  sessionId!: string;

  @Field(() => String, { nullable: true })
  content!: string | undefined;

  @Field(() => [String], { nullable: true })
  attachments!: string[] | undefined;

  @Field(() => [GraphQLUpload], { nullable: true })
  blobs!: FileUpload[] | undefined;

  @Field(() => GraphQLJSON, { nullable: true })
  params!: Record<string, string> | undefined;
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

// ================== Return Types ==================

@ObjectType('ChatMessage')
class ChatMessageType implements Partial<ChatMessage> {
  @Field(() => String)
  role!: 'system' | 'assistant' | 'user';

  @Field(() => String)
  content!: string;

  @Field(() => [String], { nullable: true })
  attachments!: string[];

  @Field(() => GraphQLJSON, { nullable: true })
  params!: Record<string, string> | undefined;

  @Field(() => Date, { nullable: true })
  createdAt!: Date | undefined;
}

@ObjectType('CopilotHistories')
class CopilotHistoriesType implements Partial<ChatHistory> {
  @Field(() => String)
  sessionId!: string;

  @Field(() => String, {
    description: 'An mark identifying which view to use to display the session',
    nullable: true,
  })
  action!: string | undefined;

  @Field(() => Number, {
    description: 'The number of tokens used in the session',
  })
  tokens!: number;

  @Field(() => [ChatMessageType])
  messages!: ChatMessageType[];
}

@ObjectType('CopilotQuota')
class CopilotQuotaType {
  @Field(() => SafeIntResolver, { nullable: true })
  limit?: number;

  @Field(() => SafeIntResolver)
  used!: number;
}

// ================== Resolver ==================

@ObjectType('Copilot')
export class CopilotType {
  @Field(() => ID, { nullable: true })
  workspaceId!: string | undefined;
}

@Resolver(() => CopilotType)
export class CopilotResolver {
  private readonly logger = new Logger(CopilotResolver.name);

  constructor(
    private readonly permissions: PermissionService,
    private readonly mutex: MutexService,
    private readonly chatSession: ChatSessionService,
    private readonly storage: CopilotStorage
  ) {}

  @ResolveField(() => CopilotQuotaType, {
    name: 'quota',
    description: 'Get the quota of the user in the workspace',
    complexity: 2,
  })
  async getQuota(@CurrentUser() user: CurrentUser) {
    return await this.chatSession.getQuota(user.id);
  }

  @ResolveField(() => [String], {
    description: 'Get the session list of chats in the workspace',
    complexity: 2,
  })
  async chats(
    @Parent() copilot: CopilotType,
    @CurrentUser() user: CurrentUser
  ) {
    if (!copilot.workspaceId) return [];
    await this.permissions.checkCloudWorkspace(copilot.workspaceId, user.id);
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
    if (!copilot.workspaceId) return [];
    await this.permissions.checkCloudWorkspace(copilot.workspaceId, user.id);
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
    if (!workspaceId) {
      return [];
    } else if (docId) {
      await this.permissions.checkCloudPagePermission(
        workspaceId,
        docId,
        user.id
      );
    } else {
      await this.permissions.checkCloudWorkspace(workspaceId, user.id);
    }

    const histories = await this.chatSession.listHistories(
      user.id,
      workspaceId,
      docId,
      options,
      true
    );
    return histories.map(h => ({
      ...h,
      // filter out empty messages
      messages: h.messages.filter(m => m.content || m.attachments?.length),
    }));
  }

  @Mutation(() => String, {
    description: 'Create a chat session',
  })
  async createCopilotSession(
    @CurrentUser() user: CurrentUser,
    @Args({ name: 'options', type: () => CreateChatSessionInput })
    options: CreateChatSessionInput
  ) {
    await this.permissions.checkCloudPagePermission(
      options.workspaceId,
      options.docId,
      user.id
    );
    const lockFlag = `${COPILOT_LOCKER}:session:${user.id}:${options.workspaceId}`;
    await using lock = await this.mutex.lock(lockFlag);
    if (!lock) {
      return new TooManyRequestsException('Server is busy');
    }

    await this.chatSession.checkQuota(user.id);

    const session = await this.chatSession.create({
      ...options,
      userId: user.id,
    });
    return session;
  }

  @Mutation(() => String, {
    description: 'Create a chat message',
  })
  async createCopilotMessage(
    @CurrentUser() user: CurrentUser,
    @Args({ name: 'options', type: () => CreateChatMessageInput })
    options: CreateChatMessageInput
  ) {
    const lockFlag = `${COPILOT_LOCKER}:message:${user?.id}:${options.sessionId}`;
    await using lock = await this.mutex.lock(lockFlag);
    if (!lock) {
      return new TooManyRequestsException('Server is busy');
    }
    const session = await this.chatSession.get(options.sessionId);
    if (!session) return new BadRequestException('Session not found');

    if (options.blobs) {
      options.attachments = options.attachments || [];
      const { workspaceId } = session.config;

      for (const blob of options.blobs) {
        const uploaded = await this.storage.handleUpload(user.id, blob);
        const link = await this.storage.put(
          user.id,
          workspaceId,
          uploaded.filename,
          uploaded.buffer
        );
        options.attachments.push(link);
      }
    }

    try {
      return await this.chatSession.createMessage(options);
    } catch (e: any) {
      this.logger.error(`Failed to create chat message: ${e.message}`);
      throw new Error('Failed to create chat message');
    }
  }
}

@Resolver(() => UserType)
export class UserCopilotResolver {
  constructor(private readonly permissions: PermissionService) {}

  @ResolveField(() => CopilotType)
  async copilot(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId', { nullable: true }) workspaceId?: string
  ) {
    if (workspaceId) {
      await this.permissions.checkCloudWorkspace(workspaceId, user.id);
    }
    return { workspaceId };
  }
}
