import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { AiSessionMessageRole, Prisma } from '@prisma/client';
import { omit } from 'lodash-es';

import {
  CopilotPromptInvalid,
  CopilotSessionDeleted,
  CopilotSessionInvalidInput,
  CopilotSessionNotFound,
} from '../base';
import type { PromptAttachment } from '../plugins/copilot/providers/types';
import type {
  SessionFocus,
  TurnScopeSnapshot,
} from '../plugins/copilot/runtime/contracts/shared';
import {
  type ChatMessage as CopilotChatMessage,
  ChatMessageSchema,
} from '../plugins/copilot/types';
import { BaseModel } from './base';

export enum SessionType {
  Workspace = 'workspace', // docId is null and pinned is false
  Pinned = 'pinned', // pinned is true
  Doc = 'doc', // docId points to specific document
}

type ChatPrompt = {
  name: string;
  action?: string | null;
};

type ChatAttachment = PromptAttachment;

type ChatStreamObject = {
  type: 'text-delta' | 'reasoning' | 'tool-call' | 'tool-result';
  textDelta?: string;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, any>;
  result?: any;
  rawArgumentsText?: string;
  argumentParseError?: string;
  thought?: string;
};

type ChatMessage = {
  id?: string | undefined;
  compatSubmissionId?: string | null;
  role: 'system' | 'assistant' | 'user';
  content: string;
  attachments?: ChatAttachment[] | null;
  params?: Record<string, any> | null;
  scopeSnapshot?: TurnScopeSnapshot | null;
  streamObjects?: ChatStreamObject[] | null;
  createdAt: Date;
};

type StoredChatMessage = Prisma.AiSessionMessageGetPayload<{
  select: {
    id: true;
    compatSubmissionId: true;
    role: true;
    content: true;
    attachments: true;
    streamObjects: true;
    params: true;
    scopeSnapshot: true;
    createdAt: true;
  };
}>;

const SESSION_META_SELECT = {
  id: true,
  userId: true,
  workspaceId: true,
  docId: true,
  parentSessionId: true,
  pinned: true,
  title: true,
  focus: true,
  promptName: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AiSessionSelect;

const SESSION_SELECT = {
  ...SESSION_META_SELECT,
  messages: {
    select: {
      id: true,
      role: true,
      content: true,
      attachments: true,
      streamObjects: true,
      params: true,
      scopeSnapshot: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.AiSessionSelect;

type PureChatSession = {
  sessionId: string;
  workspaceId: string;
  docId?: string | null;
  pinned?: boolean;
  title: string | null;
  messages?: ChatMessage[];
  // connect ids
  userId: string;
  parentSessionId?: string | null;
  personal?: boolean;
};

type ChatSession = PureChatSession & {
  // connect ids
  promptName: string;
  promptAction: string | null;
};

type ChatSessionWithPrompt = PureChatSession & {
  prompt: ChatPrompt;
};

type ChatSessionBaseState = Pick<ChatSession, 'userId' | 'sessionId'>;

export type ForkSessionOptions = Omit<
  ChatSession,
  'messages' | 'promptName' | 'promptAction'
> & {
  prompt: { name: string; action: string | null | undefined };
  messages: ChatMessage[];
};

type UpdateChatSessionMessage = ChatSessionBaseState &
  Pick<ChatSession, 'workspaceId'> & {
    messages: ChatMessage[];
  };

export type UpdateChatSessionOptions = ChatSessionBaseState &
  Pick<
    Partial<ChatSession>,
    'docId' | 'pinned' | 'promptName' | 'promptAction' | 'title'
  > & { workspaceId: string; personal?: boolean };

export type UpdateChatSession = ChatSessionBaseState & UpdateChatSessionOptions;

export type ListSessionOptions = Pick<
  Partial<ChatSession>,
  'sessionId' | 'workspaceId' | 'docId' | 'pinned'
> & {
  userId: string;
  action?: boolean;
  fork?: boolean;
  limit?: number;
  skip?: number;
  sessionOrder?: 'asc' | 'desc';
  messageOrder?: 'asc' | 'desc';
  personal?: boolean;

  // extra condition
  withPrompt?: boolean;
  withMessages?: boolean;
};

export type CleanupSessionOptions = Pick<
  ChatSession,
  'userId' | 'workspaceId' | 'docId'
> & {
  sessionIds: string[];
  personal?: boolean;
};

@Injectable()
export class CopilotSessionModel extends BaseModel {
  private async lockPersonalScope(
    workspaceId: string,
    actorUserId: string,
    personal?: boolean
  ) {
    if (!personal) return;
    await this.db
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`copilot-personal:${workspaceId}`}, 0))`;
    const canonical = await this.db.workspace.count({
      where: { id: workspaceId },
    });
    if (canonical) throw new CopilotSessionNotFound();
    const foreign = await this.db.aiSession.count({
      where: { workspaceId, userId: { not: actorUserId } },
    });
    if (foreign) throw new CopilotSessionNotFound();
  }
  private noActionPromptCondition(): Prisma.AiSessionWhereInput {
    return {
      OR: [{ promptAction: null }, { promptAction: '' }],
    };
  }

  private sanitizeString<T extends string | null | undefined>(value: T): T {
    if (typeof value !== 'string') {
      return value;
    }
    return value.replaceAll('\0', '') as T;
  }

  private sanitizeJsonValue<T>(value: T): T {
    if (typeof value === 'string') {
      return this.sanitizeString(value) as T;
    }
    if (Array.isArray(value)) {
      return value.map(v => this.sanitizeJsonValue(v)) as T;
    }
    if (
      value &&
      typeof value === 'object' &&
      Object.getPrototypeOf(value) === Object.prototype
    ) {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, this.sanitizeJsonValue(v)])
      ) as T;
    }
    return value;
  }

  private sanitizeStreamObject(stream: ChatStreamObject): ChatStreamObject {
    switch (stream.type) {
      case 'text-delta':
      case 'reasoning':
        return {
          ...stream,
          textDelta: this.sanitizeString(stream.textDelta),
        };
      case 'tool-call':
        return {
          ...stream,
          toolCallId: this.sanitizeString(stream.toolCallId) ?? '',
          toolName: this.sanitizeString(stream.toolName) ?? '',
          args: this.sanitizeJsonValue(stream.args),
          rawArgumentsText: this.sanitizeString(stream.rawArgumentsText),
          argumentParseError: this.sanitizeString(stream.argumentParseError),
          thought: this.sanitizeString(stream.thought),
        };
      case 'tool-result':
        return {
          ...stream,
          toolCallId: this.sanitizeString(stream.toolCallId) ?? '',
          toolName: this.sanitizeString(stream.toolName) ?? '',
          args: this.sanitizeJsonValue(stream.args),
          result: this.sanitizeJsonValue(stream.result),
          rawArgumentsText: this.sanitizeString(stream.rawArgumentsText),
          argumentParseError: this.sanitizeString(stream.argumentParseError),
        };
    }
  }

  private sanitizeAttachments(
    attachments?: ChatAttachment[] | null
  ): ChatAttachment[] | undefined {
    if (!attachments?.length) {
      return undefined;
    }

    return attachments
      .map(attachment => {
        if (typeof attachment === 'string') {
          return this.sanitizeString(attachment) ?? '';
        }

        if ('attachment' in attachment) {
          return {
            attachment:
              this.sanitizeString(attachment.attachment) ??
              attachment.attachment,
            mimeType:
              this.sanitizeString(attachment.mimeType) ?? attachment.mimeType,
          };
        }

        switch (attachment.kind) {
          case 'url':
            return {
              ...attachment,
              url: this.sanitizeString(attachment.url) ?? attachment.url,
              mimeType:
                this.sanitizeString(attachment.mimeType) ?? attachment.mimeType,
              fileName:
                this.sanitizeString(attachment.fileName) ?? attachment.fileName,
              providerHint: attachment.providerHint
                ? {
                    provider:
                      this.sanitizeString(attachment.providerHint.provider) ??
                      attachment.providerHint.provider,
                    kind:
                      this.sanitizeString(attachment.providerHint.kind) ??
                      attachment.providerHint.kind,
                  }
                : undefined,
            };
          case 'data':
          case 'bytes':
            return {
              ...attachment,
              data: this.sanitizeString(attachment.data) ?? attachment.data,
              mimeType:
                this.sanitizeString(attachment.mimeType) ?? attachment.mimeType,
              fileName:
                this.sanitizeString(attachment.fileName) ?? attachment.fileName,
              providerHint: attachment.providerHint
                ? {
                    provider:
                      this.sanitizeString(attachment.providerHint.provider) ??
                      attachment.providerHint.provider,
                    kind:
                      this.sanitizeString(attachment.providerHint.kind) ??
                      attachment.providerHint.kind,
                  }
                : undefined,
            };
          case 'file_handle':
            return {
              ...attachment,
              fileHandle:
                this.sanitizeString(attachment.fileHandle) ??
                attachment.fileHandle,
              mimeType:
                this.sanitizeString(attachment.mimeType) ?? attachment.mimeType,
              fileName:
                this.sanitizeString(attachment.fileName) ?? attachment.fileName,
              providerHint: attachment.providerHint
                ? {
                    provider:
                      this.sanitizeString(attachment.providerHint.provider) ??
                      attachment.providerHint.provider,
                    kind:
                      this.sanitizeString(attachment.providerHint.kind) ??
                      attachment.providerHint.kind,
                  }
                : undefined,
            };
        }

        return attachment;
      })
      .filter(attachment => {
        if (typeof attachment === 'string') {
          return !!attachment;
        }
        if ('attachment' in attachment) {
          return !!attachment.attachment && !!attachment.mimeType;
        }

        switch (attachment.kind) {
          case 'url':
            return !!attachment.url;
          case 'data':
          case 'bytes':
            return !!attachment.data && !!attachment.mimeType;
          case 'file_handle':
            return !!attachment.fileHandle;
        }

        return false;
      });
  }

  private sanitizeMessage(message: ChatMessage): ChatMessage {
    return {
      ...message,
      compatSubmissionId: this.sanitizeString(message.compatSubmissionId),
      content: this.sanitizeString(message.content) ?? '',
      attachments: this.sanitizeAttachments(message.attachments),
      params: this.sanitizeJsonValue(
        omit(message.params, ['docs']) || undefined
      ),
      scopeSnapshot: this.sanitizeJsonValue(message.scopeSnapshot),
      streamObjects: message.streamObjects?.map(o =>
        this.sanitizeStreamObject(o)
      ),
    };
  }

  private toPublicMessage(message: StoredChatMessage): CopilotChatMessage {
    const { compatSubmissionId: _compatSubmissionId, ...publicMessage } =
      message;
    return ChatMessageSchema.parse({
      ...publicMessage,
      attachments: publicMessage.attachments ?? undefined,
      streamObjects: publicMessage.streamObjects ?? undefined,
      params: publicMessage.params ?? undefined,
    });
  }

  private isCountedUserMessage(
    message: Pick<StoredChatMessage, 'role'>
  ): boolean {
    return message.role === AiSessionMessageRole.user;
  }

  getSessionType(session: Pick<ChatSession, 'docId' | 'pinned'>): SessionType {
    if (session.pinned) return SessionType.Pinned;
    if (!session.docId) return SessionType.Workspace;
    return SessionType.Doc;
  }

  checkSessionPrompt(
    session: Pick<ChatSession, 'docId' | 'pinned'>,
    prompt: Partial<ChatPrompt>
  ): boolean {
    const sessionType = this.getSessionType(session);
    const { name: promptName, action: promptAction } = prompt;

    // workspace and pinned sessions cannot use action prompts
    if (
      [SessionType.Workspace, SessionType.Pinned].includes(sessionType) &&
      !!promptAction?.trim()
    ) {
      throw new CopilotPromptInvalid(
        `${promptName} are not allowed for ${sessionType} sessions`
      );
    }

    return true;
  }

  @Transactional()
  async create(state: ChatSession, reuseChat = false): Promise<string> {
    await this.lockPersonalScope(
      state.workspaceId,
      state.userId,
      state.personal
    );
    // find and return existing session if session is chat session
    if (reuseChat && !state.promptAction) {
      const sessionId = await this.find(state);
      if (sessionId) return sessionId;
    }

    if (state.pinned) {
      await this.unpin(state.workspaceId, state.userId);
    }

    const session = await this.db.aiSession.create({
      data: {
        id: state.sessionId,
        workspaceId: state.workspaceId,
        docId: state.docId,
        pinned: state.pinned ?? false,
        // connect
        userId: state.userId,
        promptName: state.promptName,
        promptAction: state.promptAction,
        parentSessionId: state.parentSessionId,
      },
      select: { id: true },
    });
    return session.id;
  }

  @Transactional()
  async createWithPrompt(
    state: ChatSessionWithPrompt,
    reuseChat = false
  ): Promise<string> {
    const { prompt, ...rest } = state;
    return await this.models.copilotSession.create(
      { ...rest, promptName: prompt.name, promptAction: prompt.action ?? null },
      reuseChat
    );
  }

  @Transactional()
  async fork(options: ForkSessionOptions): Promise<string> {
    if (options.pinned) {
      await this.unpin(options.workspaceId, options.userId);
    }
    const { messages, ...forkedState } = options;

    // create session
    const sessionId = await this.createWithPrompt({
      ...forkedState,
      messages: [],
    });
    if (options.messages.length) {
      // save message
      await this.models.copilotSession.updateMessages({
        ...forkedState,
        sessionId,
        messages,
      });
    }

    return sessionId;
  }

  @Transactional()
  async has(
    sessionId: string,
    userId: string,
    params?: Prisma.AiSessionCountArgs['where']
  ) {
    return await this.db.aiSession
      .count({ where: { id: sessionId, userId, ...params } })
      .then(c => c > 0);
  }

  @Transactional()
  async find(state: PureChatSession) {
    const extraCondition: Record<string, any> = {};
    if (state.parentSessionId) {
      // also check session id if provided session is forked session
      extraCondition.id = state.sessionId;
      extraCondition.parentSessionId = state.parentSessionId;
    }

    const session = await this.db.aiSession.findFirst({
      where: {
        userId: state.userId,
        workspaceId: state.workspaceId,
        docId: state.docId,
        parentSessionId: null,
        ...this.noActionPromptCondition(),
        ...extraCondition,
      },
      select: { id: true, deletedAt: true },
    });
    if (session?.deletedAt) throw new CopilotSessionDeleted();
    return session?.id;
  }

  @Transactional()
  async getExists<Select extends Prisma.AiSessionSelect>(
    sessionId: string,
    select?: Select,
    where?: Omit<Prisma.AiSessionWhereInput, 'id' | 'deletedAt'>
  ) {
    return (await this.db.aiSession.findUnique({
      where: { ...where, id: sessionId, deletedAt: null },
      select,
    })) as Prisma.AiSessionGetPayload<{ select: Select }> | null;
  }

  @Transactional()
  async get(
    sessionId: string,
    userId: string,
    workspaceId: string,
    personal?: boolean
  ) {
    await this.lockPersonalScope(workspaceId, userId, personal);
    return await this.getExists(sessionId, SESSION_SELECT, {
      userId,
      workspaceId,
    });
  }

  @Transactional()
  async getMeta(
    sessionId: string,
    userId: string,
    workspaceId: string,
    personal?: boolean
  ) {
    await this.lockPersonalScope(workspaceId, userId, personal);
    return await this.getExists(sessionId, SESSION_META_SELECT, {
      userId,
      workspaceId,
    });
  }

  @Transactional()
  async getOwnedScope(sessionId: string, userId: string) {
    return await this.getExists(
      sessionId,
      { workspaceId: true, docId: true },
      { userId }
    );
  }

  @Transactional()
  async getForBackground(
    sessionId: string,
    userId: string,
    workspaceId: string
  ) {
    return await this.getExists(sessionId, SESSION_SELECT, {
      userId,
      workspaceId,
    });
  }

  private getListConditions(
    options: ListSessionOptions
  ): Prisma.AiSessionWhereInput {
    const { userId, sessionId, workspaceId, docId, action, fork } = options;

    function getEqCond<T>(maybeValue: T | undefined): T | undefined {
      return maybeValue !== undefined ? maybeValue : undefined;
    }

    return {
      userId,
      workspaceId,
      docId: getEqCond(docId),
      id: getEqCond(sessionId),
      deletedAt: null,
      pinned: getEqCond(options.pinned),
      ...(action === false ? this.noActionPromptCondition() : {}),
      ...(action === true ? { NOT: this.noActionPromptCondition() } : {}),
      ...(fork === true
        ? { parentSessionId: { not: null } }
        : fork === false
          ? { parentSessionId: null }
          : {}),
    };
  }

  @Transactional()
  async count(options: ListSessionOptions) {
    if (options.workspaceId)
      await this.lockPersonalScope(
        options.workspaceId,
        options.userId,
        options.personal
      );
    return await this.db.aiSession.count({
      where: this.getListConditions(options),
    });
  }

  @Transactional()
  async list(options: ListSessionOptions) {
    if (options.workspaceId)
      await this.lockPersonalScope(
        options.workspaceId,
        options.userId,
        options.personal
      );
    return await this.db.aiSession.findMany({
      where: this.getListConditions(options),
      select: {
        id: true,
        userId: true,
        workspaceId: true,
        docId: true,
        parentSessionId: true,
        pinned: true,
        title: true,
        focus: true,
        promptName: true,
        createdAt: true,
        updatedAt: true,
        messages: options.withMessages
          ? {
              select: {
                id: true,
                role: true,
                content: true,
                attachments: true,
                streamObjects: true,
                params: true,
                scopeSnapshot: true,
                createdAt: true,
              },
              orderBy: {
                // message order is asc by default
                createdAt: options?.messageOrder === 'desc' ? 'desc' : 'asc',
              },
            }
          : false,
      },
      take: options?.limit,
      skip: options?.skip,
      orderBy: {
        updatedAt: options?.sessionOrder === 'asc' ? 'asc' : 'desc',
      },
    });
  }

  @Transactional()
  async unpin(workspaceId: string, userId: string): Promise<boolean> {
    const { count } = await this.db.aiSession.updateMany({
      where: { userId, workspaceId, pinned: true, deletedAt: null },
      data: { pinned: false },
    });

    return count > 0;
  }

  @Transactional()
  async update(
    options: UpdateChatSessionOptions,
    internalCall = false
  ): Promise<string> {
    const { userId, sessionId, docId, promptName, pinned, title } = options;
    const sanitizedTitle = this.sanitizeString(title);
    if (options.workspaceId)
      await this.lockPersonalScope(
        options.workspaceId,
        options.userId,
        options.personal
      );
    const session = await this.getExists(
      sessionId,
      {
        id: true,
        workspaceId: true,
        docId: true,
        parentSessionId: true,
        pinned: true,
        promptAction: true,
      },
      { userId, workspaceId: options.workspaceId }
    );
    if (!session) {
      throw new CopilotSessionNotFound();
    }

    // not allow to update action session
    if (!internalCall) {
      if (session.promptAction) {
        throw new CopilotSessionInvalidInput(
          `Cannot update action: ${session.id}`
        );
      } else if (docId && session.parentSessionId) {
        throw new CopilotSessionInvalidInput(
          `Cannot update docId for forked session: ${session.id}`
        );
      }
    }

    let nextPromptAction: string | null | undefined;
    if (promptName) {
      nextPromptAction = options.promptAction;
      if (nextPromptAction === undefined) {
        throw new CopilotSessionInvalidInput(
          `Prompt action is required when changing prompt ${promptName}`
        );
      }
      if (nextPromptAction) {
        throw new CopilotSessionInvalidInput(
          `Prompt ${promptName} not found or not available for session ${sessionId}`
        );
      }
    }
    if (pinned && pinned !== session.pinned) {
      // if pin the session, unpin exists session in the workspace
      await this.unpin(session.workspaceId, userId);
    }

    await this.db.aiSession.update({
      where: { id: sessionId, userId, workspaceId: options.workspaceId },
      data: {
        docId,
        promptName,
        promptAction: nextPromptAction,
        pinned,
        title: sanitizedTitle,
      },
    });

    return sessionId;
  }

  async setTitleIfAbsent(options: {
    userId: string;
    sessionId: string;
    workspaceId: string;
    title: string;
  }): Promise<boolean> {
    const { userId, sessionId, workspaceId, title } = options;
    const { count } = await this.db.aiSession.updateMany({
      where: {
        id: sessionId,
        userId,
        workspaceId,
        title: null,
        deletedAt: null,
        ...this.noActionPromptCondition(),
      },
      data: { title: this.sanitizeString(title) },
    });
    return count > 0;
  }

  @Transactional()
  async cleanup(options: CleanupSessionOptions): Promise<string[]> {
    await this.lockPersonalScope(
      options.workspaceId,
      options.userId,
      options.personal
    );
    const sessions = await this.db.aiSession.findMany({
      where: {
        id: { in: options.sessionIds },
        userId: options.userId,
        workspaceId: options.workspaceId,
        docId: options.docId,
        deletedAt: null,
      },
      select: { id: true },
    });

    const sessionIds = sessions.map(({ id }) => id);
    // cleanup all messages
    await this.db.aiSessionMessage.deleteMany({
      where: { sessionId: { in: sessionIds } },
    });

    await this.db.aiSession.updateMany({
      where: { id: { in: sessionIds } },
      data: { pinned: false, deletedAt: new Date() },
    });

    return sessionIds;
  }

  @Transactional()
  async getMessages(
    sessionId: string,
    userId: string,
    workspaceId: string,
    select?: Prisma.AiSessionMessageSelect,
    orderBy?: Prisma.AiSessionMessageOrderByWithRelationInput
  ) {
    return this.db.aiSessionMessage.findMany({
      where: { sessionId, session: { userId, workspaceId } },
      select,
      orderBy: orderBy ?? { createdAt: 'asc' },
    });
  }

  @Transactional()
  async getMessage(
    sessionId: string,
    userId: string,
    workspaceId: string,
    messageId: string
  ) {
    const message = await this.db.aiSessionMessage.findFirst({
      where: {
        id: messageId,
        sessionId,
        session: { userId, workspaceId },
      },
      select: {
        id: true,
        compatSubmissionId: true,
        role: true,
        content: true,
        attachments: true,
        streamObjects: true,
        params: true,
        scopeSnapshot: true,
        createdAt: true,
      },
    });

    return message ? this.toPublicMessage(message) : null;
  }

  @Transactional()
  async findMessageByCompatSubmissionId(
    sessionId: string,
    userId: string,
    workspaceId: string,
    compatSubmissionId: string
  ) {
    const message = await this.db.aiSessionMessage.findFirst({
      where: {
        sessionId,
        compatSubmissionId,
        session: { userId, workspaceId },
      },
      select: {
        id: true,
        compatSubmissionId: true,
        role: true,
        content: true,
        attachments: true,
        streamObjects: true,
        params: true,
        scopeSnapshot: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return message ? this.toPublicMessage(message) : null;
  }

  @Transactional()
  async updateMessages(state: UpdateChatSessionMessage) {
    const { sessionId, userId, workspaceId, messages } = state;
    const haveSession = await this.has(sessionId, userId, { workspaceId });
    if (!haveSession) {
      throw new CopilotSessionNotFound();
    }

    if (messages.length) {
      const sanitizedMessages = messages.map(m => this.sanitizeMessage(m));
      await this.db.aiSessionMessage.createMany({
        data: sanitizedMessages.map(m => ({
          compatSubmissionId: m.compatSubmissionId || undefined,
          role: m.role,
          content: m.content,
          attachments: m.attachments || undefined,
          params: m.params || undefined,
          scopeSnapshot: m.scopeSnapshot || undefined,
          streamObjects: m.streamObjects || undefined,
          createdAt: m.createdAt,
          sessionId,
        })),
      });

      // only count message generated by user
      const userMessages = sanitizedMessages.filter(m => m.role === 'user');
      await this.db.aiSession.update({
        where: { id: sessionId, userId, workspaceId },
        data: {
          messageCost: { increment: userMessages.length },
        },
      });
    }
  }

  @Transactional()
  async appendMessage(state: {
    sessionId: string;
    userId: string;
    workspaceId: string;
    personal?: boolean;
    message: ChatMessage;
    focus?: SessionFocus;
    artifacts?: Array<{
      artifactId: string;
      role: string;
      displayName?: string;
      metadata?: Record<string, unknown>;
    }>;
  }) {
    await this.lockPersonalScope(
      state.workspaceId,
      state.userId,
      state.personal
    );
    const session = await this.getExists(
      state.sessionId,
      { id: true, workspaceId: true },
      { userId: state.userId, workspaceId: state.workspaceId }
    );
    if (!session) {
      throw new CopilotSessionNotFound();
    }

    const message = this.sanitizeMessage(state.message);
    const artifacts = [];
    const artifactKeys = new Set<string>();
    for (const artifact of state.artifacts ?? []) {
      const key = `${artifact.artifactId}:${artifact.role}`;
      if (artifactKeys.has(key)) continue;
      artifactKeys.add(key);
      artifacts.push(artifact);
    }
    const created = await this.db.aiSessionMessage.create({
      data: {
        sessionId: state.sessionId,
        compatSubmissionId: message.compatSubmissionId || undefined,
        role: message.role,
        content: message.content,
        attachments: message.attachments || undefined,
        params: message.params || undefined,
        scopeSnapshot: message.scopeSnapshot || undefined,
        streamObjects: message.streamObjects || undefined,
        createdAt: message.createdAt,
        artifacts: artifacts.length
          ? {
              create: artifacts.map(artifact => ({
                role: artifact.role,
                displayName: this.sanitizeString(artifact.displayName),
                metadata: this.sanitizeJsonValue(artifact.metadata) as
                  | Prisma.InputJsonObject
                  | undefined,
                artifact: {
                  connect: {
                    workspaceId_id: {
                      workspaceId: session.workspaceId,
                      id: artifact.artifactId,
                    },
                  },
                },
              })),
            }
          : undefined,
      },
      select: {
        id: true,
        compatSubmissionId: true,
        role: true,
        content: true,
        attachments: true,
        streamObjects: true,
        params: true,
        scopeSnapshot: true,
        createdAt: true,
      },
    });

    await this.db.aiSession.update({
      where: {
        id: state.sessionId,
        userId: state.userId,
        workspaceId: state.workspaceId,
      },
      data: {
        messageCost:
          message.role === AiSessionMessageRole.user
            ? { increment: 1 }
            : undefined,
        focus: state.focus,
      },
    });

    return this.toPublicMessage(created);
  }

  @Transactional()
  async trimAfterMessage(
    sessionId: string,
    userId: string,
    workspaceId: string,
    messageId: string,
    removeTargetMessage = false
  ) {
    const session = await this.getExists(
      sessionId,
      { id: true },
      { userId, workspaceId }
    );
    if (!session) {
      throw new CopilotSessionNotFound();
    }

    const messages = await this.getMessages(
      sessionId,
      userId,
      workspaceId,
      { id: true, role: true, content: true, params: true },
      { createdAt: 'asc' }
    );
    const messageIndex = messages.findIndex(({ id }) => id === messageId);
    if (messageIndex < 0) {
      throw new CopilotSessionNotFound();
    }

    const ids = messages
      .slice(messageIndex + (removeTargetMessage ? 0 : 1))
      .map(({ id }) => id);

    if (!ids.length) {
      return;
    }

    await this.db.aiSessionMessage.deleteMany({
      where: { id: { in: ids }, session: { userId, workspaceId } },
    });

    const remainingMessages = await this.getMessages(
      sessionId,
      userId,
      workspaceId,
      { role: true }
    );
    const userMessageCount = remainingMessages.filter(message =>
      this.isCountedUserMessage(message)
    ).length;

    if (userMessageCount <= 1) {
      await this.db.aiSession.update({
        where: { id: sessionId, userId, workspaceId },
        data: { title: null },
      });
    }
  }

  @Transactional()
  async revertLatestMessage(
    sessionId: string,
    userId: string,
    removeLatestUserMessage: boolean,
    workspaceId: string,
    personal?: boolean
  ) {
    await this.lockPersonalScope(workspaceId, userId, personal);
    const session = await this.getExists(
      sessionId,
      { id: true },
      { userId, workspaceId }
    );
    if (!session) {
      throw new CopilotSessionNotFound();
    }
    const messages = await this.getMessages(session.id, userId, workspaceId, {
      id: true,
      role: true,
      content: true,
    });
    const ids = messages
      .slice(
        messages.findLastIndex(
          ({ role }) => role === AiSessionMessageRole.user
        ) + (removeLatestUserMessage ? 0 : 1)
      )
      .map(({ id }) => id);

    if (ids.length) {
      await this.db.aiSessionMessage.deleteMany({
        where: { id: { in: ids }, session: { userId, workspaceId } },
      });

      // clear the title if there only one round of conversation left
      const remainingMessages = await this.getMessages(
        session.id,
        userId,
        workspaceId,
        { role: true }
      );
      const userMessageCount = remainingMessages.filter(message =>
        this.isCountedUserMessage(message)
      ).length;

      if (userMessageCount <= 1) {
        await this.db.aiSession.update({
          where: { id: session.id, userId, workspaceId },
          data: { title: null },
        });
      }
    }
  }

  @Transactional()
  async countUserMessages(userId: string): Promise<number> {
    const sessions = await this.db.aiSession.findMany({
      where: { userId },
      select: { messageCost: true, promptAction: true },
    });
    const regularMessageCost = sessions
      .filter(({ promptAction }) => !promptAction)
      .map(({ messageCost }) => messageCost)
      .reduce((prev, cost) => prev + cost, 0);
    const [
      actionRunCost,
      legacyActionSessionCost,
      transcriptSettlementCost,
      byokQuotaExemptCost,
    ] = await Promise.all([
      this.models.copilotActionRun.countSucceededByUser(userId),
      this.models.copilotActionRun.countLegacyPromptActionSessionsWithoutRun(
        userId
      ),
      this.models.copilotTranscriptTask.countSettledByUser(userId),
      this.models.copilotUsage.countQuotaExemptByokUsage(userId),
    ]);
    const quotaBackedCost =
      regularMessageCost +
      actionRunCost +
      legacyActionSessionCost +
      transcriptSettlementCost -
      byokQuotaExemptCost;
    return Math.max(0, quotaBackedCost);
  }

  async cleanupEmptySessions(earlyThen: Date, limit = 100) {
    const unused = await this.db.aiSession.findMany({
      where: {
        messageCost: 0,
        deletedAt: null,
        updatedAt: { lt: earlyThen },
      },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    const { count: removed } = await this.db.aiSession.deleteMany({
      where: { id: { in: unused.map(session => session.id) } },
    });

    const remaining = Math.max(0, limit - removed);
    const empty = remaining
      ? await this.db.aiSession.findMany({
          where: {
            deletedAt: null,
            messages: { none: {} },
            updatedAt: { lt: earlyThen },
          },
          select: { id: true },
          orderBy: { updatedAt: 'asc' },
          take: remaining,
        })
      : [];
    const { count: cleaned } = await this.db.aiSession.updateMany({
      where: { id: { in: empty.map(session => session.id) } },
      data: { deletedAt: new Date(), pinned: false },
    });

    return { removed, cleaned };
  }

  async toBeGenerateTitle(limit = 100) {
    return await this.db.aiSession.findMany({
      where: {
        title: null,
        deletedAt: null,
        ...this.noActionPromptCondition(),
        messages: { some: { role: AiSessionMessageRole.assistant } },
      },
      select: {
        id: true,
        userId: true,
        workspaceId: true,
        _count: { select: { messages: { where: { role: 'assistant' } } } },
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
  }
}
