import { createHash } from 'node:crypto';

import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  InputType,
  Mutation,
  ObjectType,
  Parent,
  Query,
  registerEnumType,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { AiPromptRole } from '@prisma/client';
import { GraphQLJSON, SafeIntResolver } from 'graphql-scalars';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';

import { CurrentUser } from '../../core/auth';
import { Admin } from '../../core/common';
import { UserType } from '../../core/user';
import { PermissionService } from '../../core/workspaces/permission';
import {
  FileUpload,
  MutexService,
  Throttle,
  TooManyRequestsException,
} from '../../fundamentals';
import { PromptService } from './prompt';
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
class DeleteSessionInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => String)
  docId!: string;

  @Field(() => [String])
  sessionIds!: string[];
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
  blobs!: Promise<FileUpload>[] | undefined;

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

  @Field(() => Date)
  createdAt!: Date;
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

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType('CopilotQuota')
class CopilotQuotaType {
  @Field(() => SafeIntResolver, { nullable: true })
  limit?: number;

  @Field(() => SafeIntResolver)
  used!: number;
}

registerEnumType(AiPromptRole, {
  name: 'CopilotPromptMessageRole',
});

@InputType('CopilotPromptMessageInput')
@ObjectType()
class CopilotPromptMessageType {
  @Field(() => AiPromptRole)
  role!: AiPromptRole;

  @Field(() => String)
  content!: string;

  @Field(() => GraphQLJSON, { nullable: true })
  params!: Record<string, string> | null;
}

registerEnumType(AvailableModels, { name: 'CopilotModels' });

@ObjectType()
class CopilotPromptType {
  @Field(() => String)
  name!: string;

  @Field(() => AvailableModels)
  model!: AvailableModels;

  @Field(() => String, { nullable: true })
  action!: string | null;

  @Field(() => [CopilotPromptMessageType])
  messages!: CopilotPromptMessageType[];
}

// ================== Resolver ==================

@ObjectType('Copilot')
export class CopilotType {
  @Field(() => ID, { nullable: true })
  workspaceId!: string | undefined;
}

@Throttle()
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

  @Mutation(() => [String], {
    description: 'Cleanup sessions',
  })
  async cleanupCopilotSession(
    @CurrentUser() user: CurrentUser,
    @Args({ name: 'options', type: () => DeleteSessionInput })
    options: DeleteSessionInput
  ) {
    await this.permissions.checkCloudPagePermission(
      options.workspaceId,
      options.docId,
      user.id
    );
    if (!options.sessionIds.length) {
      return new NotFoundException('Session not found');
    }
    const lockFlag = `${COPILOT_LOCKER}:session:${user.id}:${options.workspaceId}`;
    await using lock = await this.mutex.lock(lockFlag);
    if (!lock) {
      return new TooManyRequestsException('Server is busy');
    }

    return await this.chatSession.cleanup({
      ...options,
      userId: user.id,
    });
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
    if (!session || session.config.userId !== user.id) {
      return new BadRequestException('Session not found');
    }

    if (options.blobs) {
      options.attachments = options.attachments || [];
      const { workspaceId } = session.config;

      const blobs = await Promise.all(options.blobs);
      delete options.blobs;

      for (const blob of blobs) {
        const uploaded = await this.storage.handleUpload(user.id, blob);
        const filename = createHash('sha256')
          .update(uploaded.buffer)
          .digest('base64url');
        const link = await this.storage.put(
          user.id,
          workspaceId,
          filename,
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

@Throttle()
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

@InputType()
class CreateCopilotPromptInput {
  @Field(() => String)
  name!: string;

  @Field(() => AvailableModels)
  model!: AvailableModels;

  @Field(() => String, { nullable: true })
  action!: string | null;

  @Field(() => [CopilotPromptMessageType])
  messages!: CopilotPromptMessageType[];
}

@Admin()
@Resolver(() => String)
export class PromptsManagementResolver {
  constructor(private readonly promptService: PromptService) {}

  @Query(() => [CopilotPromptType], {
    description: 'List all copilot prompts',
  })
  async listCopilotPrompts() {
    return this.promptService.list();
  }

  @Mutation(() => CopilotPromptType, {
    description: 'Create a copilot prompt',
  })
  async createCopilotPrompt(
    @Args({ type: () => CreateCopilotPromptInput, name: 'input' })
    input: CreateCopilotPromptInput
  ) {
    await this.promptService.set(input.name, input.model, input.messages);
    return this.promptService.get(input.name);
  }

  @Mutation(() => CopilotPromptType, {
    description: 'Update a copilot prompt',
  })
  async updateCopilotPrompt(
    @Args('name') name: string,
    @Args('messages', { type: () => [CopilotPromptMessageType] })
    messages: CopilotPromptMessageType[]
  ) {
    await this.promptService.update(name, messages);
    return this.promptService.get(name);
  }
}
