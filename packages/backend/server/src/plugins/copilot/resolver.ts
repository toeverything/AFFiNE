import { createHash } from 'node:crypto';

import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  Args,
  Field,
  Float,
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

import {
  CallMetric,
  CopilotDocNotFound,
  CopilotFailedToCreateMessage,
  CopilotSessionNotFound,
  type FileUpload,
  RequestMutex,
  Throttle,
  TooManyRequest,
} from '../../base';
import { CurrentUser } from '../../core/auth';
import { Admin } from '../../core/common';
import { AccessController } from '../../core/permission';
import { UserType } from '../../core/user';
import type { ListSessionOptions, UpdateChatSession } from '../../models';
import { PromptService } from './prompt';
import { PromptMessage, StreamObject } from './providers';
import { ChatSessionService } from './session';
import { CopilotStorage } from './storage';
import {
  AvailableModels,
  type ChatHistory,
  type ChatMessage,
  type ChatSessionState,
  SubmittedMessage,
} from './types';

registerEnumType(AvailableModels, { name: 'CopilotModel' });

export const COPILOT_LOCKER = 'copilot';

// ================== Input Types ==================

@InputType()
class CreateChatSessionInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => String, { nullable: true })
  docId?: string;

  @Field(() => String, {
    description: 'The prompt name to use for the session',
  })
  promptName!: string;

  @Field(() => Boolean, { nullable: true })
  pinned?: boolean;
}

@InputType()
class UpdateChatSessionInput implements Omit<UpdateChatSession, 'userId'> {
  @Field(() => String)
  sessionId!: string;

  @Field(() => String, {
    description: 'The workspace id of the session',
    nullable: true,
  })
  docId!: string | null | undefined;

  @Field(() => Boolean, {
    description: 'Whether to pin the session',
    nullable: true,
  })
  pinned!: boolean | undefined;

  @Field(() => String, {
    description: 'The prompt name to use for the session',
    nullable: true,
  })
  promptName!: string;
}

@InputType()
class ForkChatSessionInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => String)
  docId!: string;

  @Field(() => String)
  sessionId!: string;

  @Field(() => String, {
    description:
      'Identify a message in the array and keep it with all previous messages into a forked session.',
    nullable: true,
  })
  latestMessageId?: string;
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

  @Field(() => [String], { nullable: true, deprecationReason: 'use blobs' })
  attachments!: string[] | undefined;

  @Field(() => [GraphQLUpload], { nullable: true })
  blobs!: Promise<FileUpload>[] | undefined;

  @Field(() => GraphQLJSON, { nullable: true })
  params!: Record<string, any> | undefined;
}

enum ChatHistoryOrder {
  asc = 'asc',
  desc = 'desc',
}

registerEnumType(ChatHistoryOrder, { name: 'ChatHistoryOrder' });

@InputType()
class QueryChatSessionsInput implements Partial<ListSessionOptions> {
  @Field(() => Boolean, { nullable: true })
  action: boolean | undefined;

  @Field(() => Boolean, { nullable: true })
  fork: boolean | undefined;

  @Field(() => Boolean, { nullable: true })
  pinned: boolean | undefined;

  @Field(() => Number, { nullable: true })
  limit: number | undefined;

  @Field(() => Number, { nullable: true })
  skip: number | undefined;
}

@InputType()
class QueryChatHistoriesInput
  extends QueryChatSessionsInput
  implements Partial<ListSessionOptions>
{
  @Field(() => ChatHistoryOrder, { nullable: true })
  messageOrder: 'asc' | 'desc' | undefined;

  @Field(() => ChatHistoryOrder, { nullable: true })
  sessionOrder: 'asc' | 'desc' | undefined;

  @Field(() => String, { nullable: true })
  sessionId: string | undefined;

  @Field(() => Boolean, { nullable: true })
  withPrompt: boolean | undefined;
}

// ================== Return Types ==================

@ObjectType('StreamObject')
class StreamObjectType {
  @Field(() => String)
  type!: string;

  @Field(() => String, { nullable: true })
  textDelta?: string;

  @Field(() => String, { nullable: true })
  toolCallId?: string;

  @Field(() => String, { nullable: true })
  toolName?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  args?: any;

  @Field(() => GraphQLJSON, { nullable: true })
  result?: any;
}

@ObjectType('ChatMessage')
class ChatMessageType implements Partial<ChatMessage> {
  // id will be null if message is a prompt message
  @Field(() => ID, { nullable: true })
  id!: string | undefined;

  @Field(() => String)
  role!: 'system' | 'assistant' | 'user';

  @Field(() => String)
  content!: string;

  @Field(() => [StreamObjectType], { nullable: true })
  streamObjects!: StreamObject[];

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

  @Field(() => Boolean)
  pinned!: boolean;

  @Field(() => String, {
    description: 'An mark identifying which view to use to display the session',
    nullable: true,
  })
  action!: string | null;

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

@InputType('CopilotPromptConfigInput')
@ObjectType()
class CopilotPromptConfigType {
  @Field(() => Float, { nullable: true })
  frequencyPenalty!: number | null;

  @Field(() => Float, { nullable: true })
  presencePenalty!: number | null;

  @Field(() => Float, { nullable: true })
  temperature!: number | null;

  @Field(() => Float, { nullable: true })
  topP!: number | null;
}

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

  @Field(() => String)
  model!: string;

  @Field(() => String, { nullable: true })
  action!: string | null;

  @Field(() => CopilotPromptConfigType, { nullable: true })
  config!: CopilotPromptConfigType | null;

  @Field(() => [CopilotPromptMessageType])
  messages!: CopilotPromptMessageType[];
}

@ObjectType()
export class CopilotSessionType {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  docId!: string | null;

  @Field(() => Boolean)
  pinned!: boolean;

  @Field(() => ID, { nullable: true })
  parentSessionId!: string | null;

  @Field(() => String)
  promptName!: string;

  @Field(() => String)
  model!: string;

  @Field(() => [String])
  optionalModels!: string[];
}

// ================== Resolver ==================

@ObjectType('Copilot')
export class CopilotType {
  @Field(() => ID, { nullable: true })
  workspaceId!: string | null;
}

@Throttle()
@Resolver(() => CopilotType)
export class CopilotResolver {
  constructor(
    private readonly ac: AccessController,
    private readonly mutex: RequestMutex,
    private readonly chatSession: ChatSessionService,
    private readonly storage: CopilotStorage
  ) {}

  @ResolveField(() => CopilotQuotaType, {
    name: 'quota',
    description: 'Get the quota of the user in the workspace',
    complexity: 2,
  })
  async getQuota(@CurrentUser() user: CurrentUser): Promise<CopilotQuotaType> {
    return await this.chatSession.getQuota(user.id);
  }

  @ResolveField(() => CopilotSessionType, {
    description: 'Get the session by id',
    complexity: 2,
  })
  async session(
    @Parent() copilot: CopilotType,
    @CurrentUser() user: CurrentUser,
    @Args('sessionId') sessionId: string
  ): Promise<CopilotSessionType> {
    if (!copilot.workspaceId) {
      throw new NotFoundException('Workspace not found');
    }
    await this.ac
      .user(user.id)
      .workspace(copilot.workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');
    const session = await this.chatSession.getSession(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    return this.transformToSessionType(session);
  }

  @ResolveField(() => [CopilotSessionType], {
    description: 'Get the session list in the workspace',
    complexity: 2,
  })
  async sessions(
    @Parent() copilot: CopilotType,
    @CurrentUser() user: CurrentUser,
    @Args('docId', { nullable: true }) docId?: string,
    @Args('options', { nullable: true }) options?: QueryChatSessionsInput
  ): Promise<CopilotSessionType[]> {
    if (!copilot.workspaceId) {
      throw new NotFoundException('Workspace not found');
    }
    await this.ac
      .user(user.id)
      .workspace(copilot.workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');

    const sessions = await this.chatSession.listSessions(
      Object.assign({}, options, {
        userId: user.id,
        workspaceId: copilot.workspaceId,
        docId,
      })
    );

    return sessions.map(this.transformToSessionType);
  }

  @ResolveField(() => [CopilotHistoriesType], {})
  @CallMetric('ai', 'histories')
  async histories(
    @Parent() copilot: CopilotType,
    @CurrentUser() user: CurrentUser,
    @Args('docId', { nullable: true }) docId?: string,
    @Args('options', { nullable: true }) options?: QueryChatHistoriesInput
  ): Promise<CopilotHistoriesType[]> {
    const workspaceId = copilot.workspaceId;
    if (!workspaceId) {
      return [];
    } else if (docId) {
      await this.ac
        .user(user.id)
        .doc({ workspaceId, docId })
        .allowLocal()
        .assert('Doc.Read');
    } else {
      await this.ac
        .user(user.id)
        .workspace(workspaceId)
        .allowLocal()
        .assert('Workspace.Copilot');
    }

    const histories = await this.chatSession.listHistories(
      Object.assign({}, options, { userId: user.id, workspaceId, docId })
    );

    return histories.map(h => ({
      ...h,
      // filter out empty messages
      messages: h.messages.filter(
        m => m.content || m.attachments?.length
      ) as ChatMessageType[],
    }));
  }

  @Mutation(() => String, {
    description: 'Create a chat session',
  })
  @CallMetric('ai', 'chat_session_create')
  async createCopilotSession(
    @CurrentUser() user: CurrentUser,
    @Args({ name: 'options', type: () => CreateChatSessionInput })
    options: CreateChatSessionInput
  ): Promise<string> {
    // permission check based on session type
    if (options.docId) {
      await this.ac
        .user(user.id)
        .doc({ workspaceId: options.workspaceId, docId: options.docId })
        .allowLocal()
        .assert('Doc.Update');
    } else {
      await this.ac
        .user(user.id)
        .workspace(options.workspaceId)
        .allowLocal()
        .assert('Workspace.Copilot');
    }

    const lockFlag = `${COPILOT_LOCKER}:session:${user.id}:${options.workspaceId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest('Server is busy');
    }

    await this.chatSession.checkQuota(user.id);

    return await this.chatSession.create({
      ...options,
      pinned: options.pinned ?? false,
      docId: options.docId ?? null,
      userId: user.id,
    });
  }

  @Mutation(() => String, {
    description: 'Update a chat session',
  })
  @CallMetric('ai', 'chat_session_update')
  async updateCopilotSession(
    @CurrentUser() user: CurrentUser,
    @Args({ name: 'options', type: () => UpdateChatSessionInput })
    options: UpdateChatSessionInput
  ): Promise<string> {
    const session = await this.chatSession.get(options.sessionId);
    if (!session) {
      throw new CopilotSessionNotFound();
    }
    const { workspaceId, docId } = session.config;
    if (docId) {
      await this.ac
        .user(user.id)
        .doc(workspaceId, docId)
        .allowLocal()
        .assert('Doc.Update');
    } else {
      await this.ac
        .user(user.id)
        .workspace(workspaceId)
        .allowLocal()
        .assert('Workspace.Copilot');
    }
    const lockFlag = `${COPILOT_LOCKER}:session:${user.id}:${workspaceId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest('Server is busy');
    }

    await this.chatSession.checkQuota(user.id);
    return await this.chatSession.updateSession({
      ...options,
      userId: user.id,
    });
  }

  @Mutation(() => String, {
    description: 'Create a chat session',
  })
  @CallMetric('ai', 'chat_session_fork')
  async forkCopilotSession(
    @CurrentUser() user: CurrentUser,
    @Args({ name: 'options', type: () => ForkChatSessionInput })
    options: ForkChatSessionInput
  ): Promise<string> {
    await this.ac.user(user.id).doc(options).allowLocal().assert('Doc.Update');
    const lockFlag = `${COPILOT_LOCKER}:session:${user.id}:${options.workspaceId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest('Server is busy');
    }

    if (options.workspaceId === options.docId) {
      // filter out session create request for root doc
      throw new CopilotDocNotFound({ docId: options.docId });
    }

    await this.chatSession.checkQuota(user.id);

    return await this.chatSession.fork({
      ...options,
      userId: user.id,
    });
  }

  @Mutation(() => [String], {
    description: 'Cleanup sessions',
  })
  @CallMetric('ai', 'chat_session_cleanup')
  async cleanupCopilotSession(
    @CurrentUser() user: CurrentUser,
    @Args({ name: 'options', type: () => DeleteSessionInput })
    options: DeleteSessionInput
  ): Promise<string[]> {
    await this.ac.user(user.id).doc(options).allowLocal().assert('Doc.Update');
    if (!options.sessionIds.length) {
      throw new NotFoundException('Session not found');
    }
    const lockFlag = `${COPILOT_LOCKER}:session:${user.id}:${options.workspaceId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest('Server is busy');
    }

    return await this.chatSession.cleanup({
      ...options,
      userId: user.id,
    });
  }

  @Mutation(() => String, {
    description: 'Create a chat message',
  })
  @CallMetric('ai', 'chat_message_create')
  async createCopilotMessage(
    @CurrentUser() user: CurrentUser,
    @Args({ name: 'options', type: () => CreateChatMessageInput })
    options: CreateChatMessageInput
  ): Promise<string> {
    const lockFlag = `${COPILOT_LOCKER}:message:${user?.id}:${options.sessionId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest('Server is busy');
    }
    const session = await this.chatSession.get(options.sessionId);
    if (!session || session.config.userId !== user.id) {
      throw new BadRequestException('Session not found');
    }

    const attachments: PromptMessage['attachments'] = options.attachments || [];
    if (options.blobs) {
      const { workspaceId } = session.config;

      const blobs = await Promise.all(options.blobs);
      delete options.blobs;

      for (const blob of blobs) {
        const uploaded = await this.storage.handleUpload(user.id, blob);
        const filename = createHash('sha256')
          .update(uploaded.buffer)
          .digest('base64url');
        const attachment = await this.storage.put(
          user.id,
          workspaceId,
          filename,
          uploaded.buffer
        );
        attachments.push({ attachment, mimeType: blob.mimetype });
      }
    }

    try {
      return await this.chatSession.createMessage({ ...options, attachments });
    } catch (e: any) {
      throw new CopilotFailedToCreateMessage(e.message);
    }
  }

  private transformToSessionType(
    session: Omit<ChatSessionState, 'messages'>
  ): CopilotSessionType {
    return {
      id: session.sessionId,
      parentSessionId: session.parentSessionId,
      docId: session.docId,
      pinned: session.pinned,
      promptName: session.prompt.name,
      model: session.prompt.model,
      optionalModels: session.prompt.optionalModels,
    };
  }
}

@Throttle()
@Resolver(() => UserType)
export class UserCopilotResolver {
  constructor(private readonly ac: AccessController) {}

  @ResolveField(() => CopilotType)
  async copilot(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId', { nullable: true }) workspaceId?: string
  ): Promise<CopilotType> {
    if (workspaceId) {
      await this.ac
        .user(user.id)
        .workspace(workspaceId)
        .allowLocal()
        .assert('Workspace.Copilot');
    }
    return { workspaceId: workspaceId || null };
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

  @Field(() => CopilotPromptConfigType, { nullable: true })
  config!: CopilotPromptConfigType | null;

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
    const prompts = await this.promptService.list();
    return prompts.filter(
      p =>
        p.messages.length > 0 &&
        // ignore internal prompts
        !p.name.startsWith('workflow:') &&
        !p.name.startsWith('debug:') &&
        !p.name.startsWith('chat:') &&
        !p.name.startsWith('action:')
    );
  }

  @Mutation(() => CopilotPromptType, {
    description: 'Create a copilot prompt',
  })
  async createCopilotPrompt(
    @Args({ type: () => CreateCopilotPromptInput, name: 'input' })
    input: CreateCopilotPromptInput
  ) {
    await this.promptService.set(
      input.name,
      input.model,
      input.messages,
      input.config
    );
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
    await this.promptService.update(name, messages, true);
    return this.promptService.get(name);
  }
}
