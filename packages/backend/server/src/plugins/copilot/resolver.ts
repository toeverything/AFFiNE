import { NotFoundException } from '@nestjs/common';
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

import {
  CallMetric,
  CopilotDocNotFound,
  CopilotFailedToCreateMessage,
  CopilotSessionNotFound,
  type FileUpload,
  paginate,
  Paginated,
  PaginationInput,
  RequestMutex,
  Throttle,
  TooManyRequest,
} from '../../base';
import { CurrentUser } from '../../core/auth';
import { DocAction } from '../../core/permission';
import { UserType } from '../../core/user';
import type { ListSessionOptions, UpdateChatSession } from '../../models';
import { llmGetBuiltInRouteOptions } from '../../native';
import { CopilotAccessService, type CopilotScopeMode } from './access';
import { ByokEntitlementPolicy } from './byok';
import { CompatHistoryProjector } from './compat/history-projector';
import { ConversationInboxService } from './conversation/inbox';
import { CopilotEnabled } from './feature';
import type { StreamObject } from './providers/types';
import { ChatSessionService } from './session';
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
  'userId' | 'title' | 'workspaceId' | 'personal'
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

  @Field(() => GraphQLJSON, { nullable: true })
  scopeSnapshot!: ChatMessage['scopeSnapshot'];

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

  @Field(() => String, {
    description: 'An mark identifying which view to use to display the session',
    nullable: true,
  })
  action!: string | null;

  @Field(() => Boolean)
  pinned!: boolean;

  @Field(() => String, { nullable: true })
  title!: string | null;

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
}

@ObjectType('CopilotRouteTarget')
class CopilotRouteTargetType {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  displayName!: string;

  @Field(() => String)
  minimumTier!: string;

  @Field(() => Boolean)
  available!: boolean;
}

@ObjectType('CopilotRouteOptions')
class CopilotRouteOptionsType {
  @Field(() => String)
  routeId!: string;

  @Field(() => String, { nullable: true })
  defaultTargetId!: string | null;

  @Field(() => [CopilotRouteTargetType])
  choices!: CopilotRouteTargetType[];
}

// ================== Resolver ==================

@ObjectType('Copilot')
export class CopilotType {
  @Field(() => ID, { nullable: true })
  workspaceId!: string | null;
}

@Throttle()
@CopilotEnabled()
@Resolver(() => CopilotType)
export class CopilotResolver {
  constructor(
    private readonly access: CopilotAccessService,
    private readonly mutex: RequestMutex,
    private readonly chatSession: ChatSessionService,
    private readonly historyProjector: CompatHistoryProjector,
    private readonly inbox: ConversationInboxService,
    private readonly entitlement: ByokEntitlementPolicy
  ) {}

  @ResolveField(() => CopilotRouteOptionsType, {
    nullable: true,
    description: 'List native built-in route choices for a prompt',
    complexity: 2,
  })
  async routeOptions(
    @CurrentUser() user: CurrentUser,
    @Args('promptName') promptName: string
  ): Promise<CopilotRouteOptionsType | null> {
    const options = llmGetBuiltInRouteOptions(promptName);
    if (!options) return null;
    if (env.selfhosted) {
      return { routeId: options.routeId, defaultTargetId: null, choices: [] };
    }
    const premium = await this.entitlement.hasAiPlan(user.id);
    return {
      routeId: options.routeId,
      defaultTargetId: premium
        ? (options.premiumDefaultTargetId ?? null)
        : (options.standardDefaultTargetId ?? null),
      choices: options.choices.map(choice => ({
        id: choice.id,
        displayName: choice.displayName,
        minimumTier: choice.minimumTier,
        available: premium || choice.minimumTier === 'Standard',
      })),
    };
  }

  @ResolveField(() => CopilotQuotaType, {
    name: 'quota',
    description: 'Get the quota of the user in the workspace',
    complexity: 2,
  })
  async getQuota(@CurrentUser() user: CurrentUser): Promise<CopilotQuotaType> {
    return await this.chatSession.getQuota(user.id);
  }

  private async withPermission<T>(
    user: CurrentUser,
    options: { workspaceId?: string | null; docId?: string | null },
    fallbackAction: DocAction | undefined,
    sessionIds: string[] | undefined,
    operation: (
      scope: { userId: string; workspaceId: string; docId?: string },
      mode: CopilotScopeMode
    ) => Promise<T>
  ) {
    const { workspaceId, docId } = options;
    if (!workspaceId) {
      throw new NotFoundException('Workspace not found');
    }
    const scope = {
      userId: user.id,
      workspaceId,
      docId,
      action: fallbackAction ?? (docId ? 'Doc.Update' : 'Workspace.Copilot'),
    } as const;
    const resolved = {
      userId: user.id,
      workspaceId,
      docId: docId || undefined,
    };
    const mode = sessionIds
      ? await this.access.sessionResource(scope, sessionIds)
      : await this.access.sessionCollection(scope);
    return await operation(resolved, mode);
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
    const state = await this.withPermission(
      user,
      copilot,
      undefined,
      [sessionId],
      ({ workspaceId }, mode) =>
        this.chatSession.getMetaState(
          sessionId,
          user.id,
          workspaceId,
          mode === 'personal'
        )
    );
    if (!state) {
      throw new NotFoundException('Session not found');
    }

    const projected = this.historyProjector.projectSession(state, {
      requestUserId: user.id,
      skipVisibilityFilter: true,
    });
    if (!projected) {
      throw new NotFoundException('Session not found');
    }

    return this.transformToSessionType(projected);
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

    const { sessions, mode } = await this.withPermission(
      user,
      Object.assign({}, copilot, { docId: maybeDocId }),
      undefined,
      undefined,
      async (appendOptions, mode) => ({
        sessions: await this.chatSession.listMetaStates(
          Object.assign({}, options, appendOptions, {
            personal: mode === 'personal',
          })
        ),
        mode,
      })
    );
    const appendOptions = {
      userId: user.id,
      workspaceId: copilot.workspaceId,
      docId: maybeDocId,
    };
    const projectedSessions = sessions
      .map(state =>
        this.historyProjector.projectSession(state, {
          requestUserId: user.id,
        })
      )
      .filter((history): history is Omit<ChatHistory, 'messages'> => !!history);
    if (appendOptions.docId) {
      type Session = Omit<ChatHistory, 'messages'> & { docId: string };
      const filtered = projectedSessions.filter((s): s is Session => !!s.docId);
      const accessible = await this.access.filterSessionDocs(
        {
          userId: user.id,
          workspaceId: copilot.workspaceId,
          action: 'Doc.Update',
        },
        filtered,
        mode
      );
      return accessible.map(this.transformToSessionType);
    } else {
      return projectedSessions.map(this.transformToSessionType);
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
    }

    const storedHistories = await this.withPermission(
      user,
      { workspaceId, docId },
      docId ? 'Doc.Read' : undefined,
      undefined,
      (_, mode) =>
        this.chatSession.listStates(
          Object.assign({}, options, {
            userId: user.id,
            workspaceId,
            docId,
            personal: mode === 'personal',
          })
        )
    );
    const histories = storedHistories
      .map(state =>
        this.historyProjector.projectHistory(state, {
          requestUserId: user.id,
          withMessages: true,
          withPrompt: options?.withPrompt,
          action: options?.action,
        })
      )
      .filter((history): history is ChatHistory => !!history);

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
    }

    const finalOptions = Object.assign(
      {},
      options,
      { userId: user.id, workspaceId, docId },
      { skip: pagination.offset, limit: pagination.first }
    );
    const [totalCount, stored] = await this.withPermission(
      user,
      { workspaceId, docId },
      docId ? 'Doc.Read' : undefined,
      undefined,
      (_, mode) =>
        Promise.all([
          this.chatSession.count({
            ...finalOptions,
            personal: mode === 'personal',
          }),
          options?.withMessages
            ? this.chatSession.listStates({
                ...finalOptions,
                personal: mode === 'personal',
              })
            : this.chatSession.listMetaStates({
                ...finalOptions,
                personal: mode === 'personal',
              }),
        ])
    );
    const histories: ChatHistory[] = options?.withMessages
      ? (stored as Awaited<ReturnType<ChatSessionService['listStates']>>)
          .map(state =>
            this.historyProjector.projectHistory(state, {
              requestUserId: user.id,
              withMessages: true,
              withPrompt: options?.withPrompt,
              action: options?.action,
            })
          )
          .filter((history): history is ChatHistory => !!history)
      : (
          stored as Awaited<ReturnType<ChatSessionService['listMetaStates']>>
        ).flatMap(state => {
          const session = this.historyProjector.projectSession(state, {
            requestUserId: user.id,
          });
          return session
            ? [{ ...session, messages: [] as ChatHistory['messages'] }]
            : [];
        });

    return paginate(
      histories.map(h => ({
        ...h,
        // filter out empty messages
        messages: h.messages.filter(
          m => m.content || m.attachments?.length
        ) as ChatMessageType[],
      })),
      'updatedAt',
      pagination,
      totalCount
    );
  }

  private async createCopilotSessionInternal(
    user: CurrentUser,
    options: CreateChatSessionInput
  ): Promise<string> {
    // permission check based on session type
    const lockFlag = `${COPILOT_LOCKER}:session:${user.id}:${options.workspaceId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest('Server is busy');
    }

    return await this.withPermission(
      user,
      options,
      undefined,
      undefined,
      (_, mode) =>
        this.chatSession.create({
          ...options,
          pinned: options.pinned ?? false,
          docId: options.docId ?? null,
          userId: user.id,
          personal: mode === 'personal',
        })
    );
  }

  @Mutation(() => String, {
    description: 'Create a chat session',
    deprecationReason: 'use `createCopilotSessionWithHistory` instead',
  })
  @CallMetric('ai', 'chat_session_create')
  async createCopilotSession(
    @CurrentUser() user: CurrentUser,
    @Args({ name: 'options', type: () => CreateChatSessionInput })
    options: CreateChatSessionInput
  ): Promise<string> {
    return await this.createCopilotSessionInternal(user, options);
  }

  @Mutation(() => CopilotHistoriesType, {
    description: 'Create a chat session and return full session payload',
  })
  @CallMetric('ai', 'chat_session_create_with_history')
  async createCopilotSessionWithHistory(
    @CurrentUser() user: CurrentUser,
    @Args({ name: 'options', type: () => CreateChatSessionInput })
    options: CreateChatSessionInput
  ): Promise<CopilotHistoriesType> {
    const sessionId = await this.createCopilotSessionInternal(user, options);
    const mode = await this.access.sessionResource(
      {
        userId: user.id,
        workspaceId: options.workspaceId,
        docId: options.docId,
      },
      [sessionId]
    );
    const state = await this.chatSession.getState(
      sessionId,
      user.id,
      options.workspaceId,
      mode === 'personal'
    );
    if (!state) {
      throw new NotFoundException('Session not found');
    }
    const session = this.historyProjector.projectHistory(state, {
      requestUserId: user.id,
      withMessages: true,
      withPrompt: false,
      action: !!state.prompt.action,
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    return {
      ...session,
      messages: session.messages.map(message => ({
        ...message,
        id: message.id,
      })) as ChatMessageType[],
    };
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
    const scope = await this.chatSession.getOwnedScope(
      options.sessionId,
      user.id
    );
    if (!scope) {
      throw new CopilotSessionNotFound();
    }
    const initialMode = await this.access.sessionResource(
      {
        userId: user.id,
        workspaceId: scope.workspaceId,
        docId: scope.docId,
      },
      [options.sessionId]
    );
    const session = await this.chatSession.getInScope({
      sessionId: options.sessionId,
      userId: user.id,
      workspaceId: scope.workspaceId,
      personal: initialMode === 'personal',
    });
    if (!session) throw new CopilotSessionNotFound();
    const config = session.config;
    const { workspaceId, docId: currentDocId } = config;
    const { docId: newDocId } = options;
    // check permission if the docId is changed
    if (newDocId !== undefined && newDocId !== currentDocId) {
      await this.withPermission(
        user,
        { workspaceId, docId: newDocId },
        undefined,
        undefined,
        async config => config
      );
    }

    const lockFlag = `${COPILOT_LOCKER}:session:${user.id}:${workspaceId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest('Server is busy');
    }

    const mode = await this.access.sessionResource(
      { userId: user.id, workspaceId, docId: currentDocId },
      [options.sessionId]
    );
    return await this.chatSession.update({
      ...options,
      userId: user.id,
      workspaceId,
      personal: mode === 'personal',
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
    const lockFlag = `${COPILOT_LOCKER}:session:${user.id}:${options.workspaceId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest('Server is busy');
    }

    if (options.workspaceId === options.docId) {
      // filter out session create request for root doc
      throw new CopilotDocNotFound({ docId: options.docId });
    }

    const mode = await this.access.sessionCollection({
      userId: user.id,
      workspaceId: options.workspaceId,
      docId: options.docId,
      action: 'Doc.Update',
    });
    return await this.chatSession.fork({
      ...options,
      userId: user.id,
      personal: mode === 'personal',
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
    if (!sessionIds.length) throw new NotFoundException('Session not found');
    const mode = await this.access.sessionResource(
      {
        userId: user.id,
        workspaceId,
        docId,
        action: docId ? 'Doc.Update' : 'Workspace.Copilot',
      },
      sessionIds
    );
    const lockFlag = `${COPILOT_LOCKER}:session:${user.id}:${workspaceId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) throw new TooManyRequest('Server is busy');
    return await this.chatSession.cleanup({
      ...options,
      userId: user.id,
      personal: mode === 'personal',
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
    try {
      const scope = await this.chatSession.getOwnedScope(
        options.sessionId,
        user.id
      );
      if (!scope) throw new CopilotSessionNotFound();
      const mode = await this.access.sessionResource(
        {
          userId: user.id,
          workspaceId: scope.workspaceId,
          docId: scope.docId,
          action: scope.docId ? 'Doc.Update' : 'Workspace.Copilot',
        },
        [options.sessionId]
      );
      const resolved = await this.chatSession.getInScope({
        sessionId: options.sessionId,
        userId: user.id,
        workspaceId: scope.workspaceId,
        personal: mode === 'personal',
      });
      if (!resolved) throw new CopilotSessionNotFound();
      return await this.inbox.createMessage(user.id, options, resolved, mode);
    } catch (e: any) {
      throw new CopilotFailedToCreateMessage(e.message);
    }
  }

  private transformToSessionType(session: Omit<ChatHistory, 'messages'>) {
    return { id: session.sessionId, ...session };
  }
}

@Throttle()
@CopilotEnabled()
@Resolver(() => UserType)
export class UserCopilotResolver {
  constructor(private readonly access: CopilotAccessService) {}

  @ResolveField(() => CopilotType)
  async copilot(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId', { nullable: true }) workspaceId?: string
  ): Promise<CopilotType> {
    if (workspaceId) {
      await this.access.sessionCollection({ userId: user.id, workspaceId });
      return { workspaceId };
    }
    return { workspaceId: workspaceId || null };
  }
}
