import { Logger } from '@nestjs/common';
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
import { SafeIntResolver } from 'graphql-scalars';

import { CurrentUser } from '../../core/auth';
import { QuotaService } from '../../core/quota';
import { UserType } from '../../core/user';
import { PermissionService } from '../../core/workspaces/permission';
import {
  MutexService,
  PaymentRequiredException,
  TooManyRequestsException,
} from '../../fundamentals';
import { ChatSessionService } from './session';
import {
  AvailableModels,
  type ChatHistory,
  type ChatMessage,
  type ListHistoriesOptions,
  SubmittedMessage,
} from './types';

registerEnumType(AvailableModels, { name: 'CopilotModel' });

const COPILOT_LOCKER = 'copilot';

// ================== Input Types ==================

@InputType()
class CreateChatSessionInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => String)
  docId!: string;

  @Field(() => String, {
    description: 'An mark identifying which view to use to display the session',
    nullable: true,
  })
  action!: string | undefined;

  @Field(() => String, {
    description: 'The prompt name to use for the session',
  })
  promptName!: string;
}

@InputType()
class CreateChatMessageInput implements Omit<SubmittedMessage, 'params'> {
  @Field(() => String)
  sessionId!: string;

  @Field(() => String)
  content!: string;

  @Field(() => [String], { nullable: true })
  attachments!: string[] | undefined;

  @Field(() => String, { nullable: true })
  params!: string | undefined;
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

  @Field(() => Date, { nullable: true })
  createdAt!: Date | undefined;
}

@ObjectType('CopilotHistories')
class CopilotHistoriesType implements Partial<ChatHistory> {
  @Field(() => String)
  sessionId!: string;

  @Field(() => String, {
    description: 'An mark identifying which view to use to display the session',
  })
  action!: string;

  @Field(() => Number, {
    description: 'The number of tokens used in the session',
  })
  tokens!: number;

  @Field(() => [ChatMessageType])
  messages!: ChatMessageType[];
}

@ObjectType('CopilotQuota')
class CopilotQuotaType {
  @Field(() => SafeIntResolver)
  limit!: number;

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
    private readonly quota: QuotaService,
    private readonly mutex: MutexService,
    private readonly chatSession: ChatSessionService
  ) {}

  @ResolveField(() => CopilotQuotaType, {
    name: 'quota',
    description: 'Get the quota of the user in the workspace',
    complexity: 2,
  })
  async getQuota(@CurrentUser() user: CurrentUser) {
    const quota = await this.quota.getUserQuota(user.id);
    const limit = quota.feature.copilotActionLimit;

    const actions = await this.chatSession.countUserActions(user.id);
    const chats = await this.chatSession
      .listHistories(user.id)
      .then(histories =>
        histories.reduce(
          (acc, h) => acc + h.messages.filter(m => m.role === 'user').length,
          0
        )
      );

    return { limit, used: actions + chats };
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

    return await this.chatSession.listHistories(
      user.id,
      workspaceId,
      docId,
      options
    );
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

    const { limit, used } = await this.getQuota(user);
    if (limit && Number.isFinite(limit) && used >= limit) {
      return new PaymentRequiredException(
        `You have reached the limit of actions in this workspace, please upgrade your plan.`
      );
    }

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
    try {
      const { params, ...rest } = options;
      const record: SubmittedMessage['params'] = {};
      new URLSearchParams(params).forEach((value, key) => {
        record[key] = value;
      });
      return await this.chatSession.createMessage({ ...rest, params: record });
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
