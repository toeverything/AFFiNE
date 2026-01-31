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
  CopilotProviderSideError,
  CopilotSessionNotFound,
  type FileUpload,
  paginate,
  Paginated,
  PaginationInput,
  RequestMutex,
  sniffMime,
  Throttle,
  TooManyRequest,
  UserFriendlyError,
} from '../../base';
import { CurrentUser } from '../../core/auth';
import { Admin } from '../../core/common';
import { DocReader } from '../../core/doc';
import { AccessController, DocAction } from '../../core/permission';
import { UserType } from '../../core/user';
import type { ListSessionOptions, UpdateChatSession } from '../../models';
import { CopilotCronJobs } from './cron';
import { PromptService } from './prompt';
import { PromptMessage, StreamObject } from './providers';
import { CopilotProviderFactory } from './providers/factory';
import { ChatSessionService } from './session';
import { CopilotStorage } from './storage';
import { type ChatHistory, type ChatMessage, SubmittedMessage } from './types';

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

  @Field(() => Boolean, {
    nullable: true,
    description: 'true by default, compliant for old version',
  })
  reuseLatestChat?: boolean;
}

@InputType()
class UpdateChatSessionInput implements Omit<
  UpdateChatSession,
  'userId' | 'title'
> {
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

  @Field(() => String, { nullable: true })
  docId!: string | undefined;

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

  @Field(() => GraphQLUpload, { nullable: true })
  blob!: Promise<FileUpload> | undefined;

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
  withMessages: boolean | undefined;

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
class CopilotHistoriesType implements Omit<ChatHistory, 'userId'> {
  @Field(() => String)
  sessionId!: string;

  @Field(() => String)
  workspaceId!: string;

  @Field(() => String, { nullable: true })
  docId!: string | null;

  @Field(() => String, { nullable: true })
  parentSessionId!: string | null;

  @Field(() => String)
  promptName!: string;

  @Field(() => String)
  model!: string;

  @Field(() => [String])
  optionalModels!: string[];

  @Field(() => String, {
    description: 'An mark identifying which view to use to display the session',
    nullable: true,
  })
  action!: string | null;

  @Field(() => Boolean)
  pinned!: boolean;

  @Field(() => String, { nullable: true })
  title!: string | null;

  @Field(() => Number, {
    description: 'The number of tokens used in the session',
  })
  tokens!: number;

  @Field(() => [ChatMessageType])
  messages!: ChatMessageType[];

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class PaginatedCopilotHistoriesType extends Paginated(
  CopilotHistoriesType
) {}

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
class CopilotModelType {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;
}

@ObjectType()
export class CopilotModelsType {
  @Field(() => String)
  defaultModel!: string;

  @Field(() => [CopilotModelType])
  optionalModels!: CopilotModelType[];

  @Field(() => [CopilotModelType])
  proModels!: CopilotModelType[];
}

@ObjectType()
export class CopilotSessionType {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  docId!: string | null;

  @Field(() => Boolean)
  pinned!: boolean;

  @Field(() => String, { nullable: true })
  title!: string | null;

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
  private readonly modelNames = new Map<string, string>();

  constructor(
    private readonly ac: AccessController,
    private readonly mutex: RequestMutex,
    private readonly prompt: PromptService,
    private readonly chatSession: ChatSessionService,
    private readonly storage: CopilotStorage,
    private readonly docReader: DocReader,
    private readonly providerFactory: CopilotProviderFactory
  ) {}

  @ResolveField(() => CopilotQuotaType, {
    name: 'quota',
    description: 'Get the quota of the user in the workspace',
    complexity: 2,
  })
  async getQuota(@CurrentUser() user: CurrentUser): Promise<CopilotQuotaType> {
    return await this.chatSession.getQuota(user.id);
  }

  private async assertPermission(
    user: CurrentUser,
    options: { workspaceId?: string | null; docId?: string | null },
    fallbackAction?: DocAction
  ) {
    const { workspaceId, docId } = options;
    if (!workspaceId) {
      throw new NotFoundException('Workspace not found');
    }
    if (docId) {
      await this.ac
        .user(user.id)
        .doc({ workspaceId, docId })
        .allowLocal()
        .assert(fallbackAction ?? 'Doc.Update');
    } else {
      await this.ac
        .user(user.id)
        .workspace(workspaceId)
        .allowLocal()
        .assert('Workspace.Copilot');
    }
    return { userId: user.id, workspaceId, docId: docId || undefined };
  }

  @ResolveField(() => CopilotModelsType, {
    description:
      'List available models for a prompt, with human-readable names',
    complexity: 2,
  })
  async models(
    @Args('promptName') promptName: string
  ): Promise<CopilotModelsType> {
    const prompt = await this.prompt.get(promptName);
    if (!prompt) {
      throw new NotFoundException('Prompt not found');
    }
    const convertModels = (ids: string[]) => {
      return ids
        .map(id => ({ id, name: this.modelNames.get(id) }))
        .filter(m => !!m.name) as CopilotModelType[];
    };
    const proModels = prompt.config?.proModels || [];
    const missing = new Set(
      [...prompt.optionalModels, ...proModels].filter(
        id => !this.modelNames.has(id)
      )
    );
    if (missing.size) {
      for (const model of missing) {
        if (this.modelNames.has(model)) continue;
        const provider = await this.providerFactory.getProviderByModel(model);
        if (provider?.configured()) {
          for (const m of provider.models) {
            if (m.name) this.modelNames.set(m.id, m.name);
          }
        }
      }
    }

    return {
      defaultModel: prompt.model,
      optionalModels: convertModels(prompt.optionalModels),
      proModels: convertModels(proModels),
    };
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
    await this.assertPermission(user, copilot);
    const session = await this.chatSession.getSessionInfo(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    return this.transformToSessionType(session);
  }

  @ResolveField(() => [CopilotSessionType], {
    description: 'Get the session list in the workspace',
    deprecationReason: 'use `chats` instead',
    complexity: 2,
  })
  async sessions(
    @Parent() copilot: CopilotType,
    @CurrentUser() user: CurrentUser,
    @Args('docId', { nullable: true }) maybeDocId?: string,
    @Args('options', { nullable: true }) options?: QueryChatSessionsInput
  ): Promise<CopilotSessionType[]> {
    if (!copilot.workspaceId) {
      return [];
    }

    const appendOptions = await this.assertPermission(
      user,
      Object.assign({}, copilot, { docId: maybeDocId })
    );

    const sessions = await this.chatSession.list(
      Object.assign({}, options, appendOptions),
      false
    );
    if (appendOptions.docId) {
      type Session = ChatHistory & { docId: string };
      const filtered = sessions.filter((s): s is Session => !!s.docId);
      const accessible = await this.ac
        .user(user.id)
        .workspace(copilot.workspaceId)
        .docs(filtered, 'Doc.Update');
      return accessible.map(this.transformToSessionType);
    } else {
      return sessions.map(this.transformToSessionType);
    }
  }

  @ResolveField(() => [CopilotHistoriesType], {
    deprecationReason: 'use `chats` instead',
  })
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
    } else {
      await this.assertPermission(user, { workspaceId, docId }, 'Doc.Read');
    }

    const histories = await this.chatSession.list(
      Object.assign({}, options, { userId: user.id, workspaceId, docId }),
      true
    );

    return histories.map(h => ({
      ...h,
      // filter out empty messages
      messages: h.messages.filter(
        m => m.content || m.attachments?.length
      ) as ChatMessageType[],
    }));
  }

  @ResolveField(() => PaginatedCopilotHistoriesType, {})
  @CallMetric('ai', 'histories')
  async chats(
    @Parent() copilot: CopilotType,
    @CurrentUser() user: CurrentUser,
    @Args('pagination', PaginationInput.decode) pagination: PaginationInput,
    @Args('docId', { nullable: true }) docId?: string,
    @Args('options', { nullable: true }) options?: QueryChatHistoriesInput
  ): Promise<PaginatedCopilotHistoriesType> {
    const workspaceId = copilot.workspaceId;
    if (!workspaceId) {
      return paginate([], 'updatedAt', pagination, 0);
    } else {
      await this.assertPermission(user, { workspaceId, docId }, 'Doc.Read');
    }

    const finalOptions = Object.assign(
      {},
      options,
      { userId: user.id, workspaceId, docId },
      { skip: pagination.offset, limit: pagination.first }
    );
    const totalCount = await this.chatSession.count(finalOptions);
    const histories = await this.chatSession.list(
      finalOptions,
      !!options?.withMessages
    );

    return paginate(
      histories.map(h => ({
        ...h,
        // filter out empty messages
        messages: h.messages?.filter(
          m => m.content || m.attachments?.length
        ) as ChatMessageType[],
      })),
      'updatedAt',
      pagination,
      totalCount
    );
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
    await this.assertPermission(user, options);

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

    const config = await this.assertPermission(user, session.config);
    const { workspaceId, docId: currentDocId } = config;
    const { docId: newDocId } = options;
    // check permission if the docId is changed
    if (newDocId !== undefined && newDocId !== currentDocId) {
      await this.assertPermission(user, { workspaceId, docId: newDocId });
    }

    const lockFlag = `${COPILOT_LOCKER}:session:${user.id}:${workspaceId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest('Server is busy');
    }

    await this.chatSession.checkQuota(user.id);
    return await this.chatSession.update({
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
    const { workspaceId, docId, sessionIds } = options;
    if (docId) {
      await this.ac
        .user(user.id)
        .doc({ workspaceId, docId })
        .allowLocal()
        .assert('Doc.Update');
    } else {
      await this.ac
        .user(user.id)
        .workspace(workspaceId)
        .allowLocal()
        .assert('Workspace.Copilot');
    }
    if (!sessionIds.length) {
      throw new NotFoundException('Session not found');
    }
    const lockFlag = `${COPILOT_LOCKER}:session:${user.id}:${workspaceId}`;
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
    if (options.blob || options.blobs) {
      const { workspaceId } = session.config;

      const blobs = await Promise.all(
        options.blob ? [options.blob] : options.blobs || []
      );
      delete options.blob;
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
        attachments.push({
          attachment,
          mimeType: sniffMime(uploaded.buffer, blob.mimetype) || blob.mimetype,
        });
      }
    }

    try {
      return await this.chatSession.createMessage({ ...options, attachments });
    } catch (e: any) {
      throw new CopilotFailedToCreateMessage(e.message);
    }
  }

  @Query(() => String, {
    description:
      'Apply updates to a doc using LLM and return the merged markdown.',
    deprecationReason: 'use Mutation.applyDocUpdates',
  })
  async applyDocUpdates(
    @CurrentUser() user: CurrentUser,
    @Args({ name: 'workspaceId', type: () => String })
    workspaceId: string,
    @Args({ name: 'docId', type: () => String })
    docId: string,
    @Args({ name: 'op', type: () => String })
    op: string,
    @Args({ name: 'updates', type: () => String })
    updates: string
  ): Promise<string> {
    return this.applyDocUpdatesInternal(user, workspaceId, docId, op, updates);
  }

  @Mutation(() => String, {
    description:
      'Apply updates to a doc using LLM and return the merged markdown.',
    name: 'applyDocUpdates',
  })
  async applyDocUpdatesMutation(
    @CurrentUser() user: CurrentUser,
    @Args({ name: 'workspaceId', type: () => String })
    workspaceId: string,
    @Args({ name: 'docId', type: () => String })
    docId: string,
    @Args({ name: 'op', type: () => String })
    op: string,
    @Args({ name: 'updates', type: () => String })
    updates: string
  ): Promise<string> {
    return this.applyDocUpdatesInternal(user, workspaceId, docId, op, updates);
  }

  private async applyDocUpdatesInternal(
    user: CurrentUser,
    workspaceId: string,
    docId: string,
    op: string,
    updates: string
  ): Promise<string> {
    await this.assertPermission(user, { workspaceId, docId });

    const docContent = await this.docReader.getDocMarkdown(
      workspaceId,
      docId,
      true
    );
    if (!docContent || !docContent.markdown) {
      throw new NotFoundException('Doc not found or empty');
    }

    const markdown = docContent.markdown.trim();

    // Get LLM provider
    const provider =
      await this.providerFactory.getProviderByModel('morph-v3-large');
    if (!provider) {
      throw new BadRequestException('No LLM provider available');
    }

    try {
      return await provider.text(
        { modelId: 'morph-v3-large' },
        [
          {
            role: 'user',
            content: `<instruction>${op}</instruction>\n<code>${markdown}</code>\n<update>${updates}</update>`,
          },
        ],
        { reasoning: false }
      );
    } catch (e: any) {
      if (e instanceof UserFriendlyError) {
        throw e;
      } else {
        throw new CopilotProviderSideError({
          provider: provider.type,
          kind: 'unexpected_response',
          message: e?.message || 'Unexpected apply response',
        });
      }
    }
  }

  private transformToSessionType(
    session: Omit<ChatHistory, 'messages'>
  ): CopilotSessionType {
    return { id: session.sessionId, ...session };
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

  @Field(() => String)
  model!: string;

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
  constructor(
    private readonly cron: CopilotCronJobs,
    private readonly promptService: PromptService
  ) {}

  @Mutation(() => Boolean, {
    description: 'Trigger generate missing titles cron job',
  })
  async triggerGenerateTitleCron() {
    await this.cron.triggerGenerateMissingTitles();
    return true;
  }

  @Mutation(() => Boolean, {
    description: 'Trigger cleanup of trashed doc embeddings',
  })
  async triggerCleanupTrashedDocEmbeddings() {
    await this.cron.triggerCleanupTrashedDocEmbeddings();
    return true;
  }

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
    await this.promptService.update(name, { messages, modified: true });
    return this.promptService.get(name);
  }
}
