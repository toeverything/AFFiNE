import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { AiPromptRole, Prisma } from '@prisma/client';
import { omit } from 'lodash-es';

import {
  CopilotPromptInvalid,
  CopilotSessionDeleted,
  CopilotSessionInvalidInput,
  CopilotSessionNotFound,
} from '../base';
import { getTokenEncoder } from '../native';
import type { PromptAttachment } from '../plugins/copilot/providers/types';
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
  model: string;
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
    createdAt: true;
  };
}>;

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
  prompt: { name: string; action: string | null | undefined; model: string };
  messages: ChatMessage[];
};

type UpdateChatSessionMessage = ChatSessionBaseState & {
  prompt: { model: string };
  messages: ChatMessage[];
};

export type UpdateChatSessionOptions = ChatSessionBaseState &
  Pick<
    Partial<ChatSession>,
    'docId' | 'pinned' | 'promptName' | 'promptAction' | 'title'
  > & { promptModel?: string };

export type UpdateChatSession = ChatSessionBaseState & UpdateChatSessionOptions;

export type ListSessionOptions = Pick<
  Partial<ChatSession>,
  'sessionId' | 'workspaceId' | 'docId' | 'pinned'
> & {
  userId: string | undefined;
  action?: boolean;
  fork?: boolean;
  limit?: number;
  skip?: number;
  sessionOrder?: 'asc' | 'desc';
  messageOrder?: 'asc' | 'desc';

  // extra condition
  withPrompt?: boolean;
  withMessages?: boolean;
};

export type CleanupSessionOptions = Pick<
  ChatSession,
  'userId' | 'workspaceId' | 'docId'
> & {
  sessionIds: string[];
};

@Injectable()
export class CopilotSessionModel extends BaseModel {
  private noActionPromptCondition(): Prisma.AiSessionWhereInput {
    return {
      OR: [{ promptAction: null }, { promptAction: '' }],
    };
  }

  private async ensurePromptCompatRecord(prompt: ChatPrompt) {
    await this.db.aiPrompt.upsert({
      where: { name: prompt.name },
      update: {},
      create: {
        name: prompt.name,
        action: prompt.action,
        model: prompt.model,
        optionalModels: [],
        config: {},
      },
    });
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
    return message.role === AiPromptRole.user;
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
    await this.ensurePromptCompatRecord(prompt);
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
  async get(sessionId: string) {
    return await this.getExists(sessionId, {
      id: true,
      userId: true,
      workspaceId: true,
      docId: true,
      parentSessionId: true,
      pinned: true,
      title: true,
      promptName: true,
      tokenCost: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        select: {
          id: true,
          role: true,
          content: true,
          attachments: true,
          streamObjects: true,
          params: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    });
  }

  @Transactional()
  async getMeta(sessionId: string) {
    return await this.getExists(sessionId, {
      id: true,
      userId: true,
      workspaceId: true,
      docId: true,
      parentSessionId: true,
      pinned: true,
      title: true,
      promptName: true,
      tokenCost: true,
      createdAt: true,
      updatedAt: true,
    });
  }

  private getListConditions(
    options: ListSessionOptions
  ): Prisma.AiSessionWhereInput {
    const { userId, sessionId, workspaceId, docId, action, fork } = options;

    function getEqCond<T>(maybeValue: T | undefined): T | undefined {
      return maybeValue !== undefined ? maybeValue : undefined;
    }

    const conditions: Prisma.AiSessionWhereInput['OR'] = [
      {
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
      },
    ];

    if (!action && fork) {
      // query forked sessions from other users
      // only query forked session if fork == true and action == false
      conditions.push({
        userId: { not: userId },
        workspaceId: workspaceId,
        docId: docId ?? null,
        id: getEqCond(sessionId),
        ...this.noActionPromptCondition(),
        // should only find forked session
        parentSessionId: { not: null },
        deletedAt: null,
      });
    }

    return { OR: conditions };
  }

  async count(options: ListSessionOptions) {
    return await this.db.aiSession.count({
      where: this.getListConditions(options),
    });
  }

  async list(options: ListSessionOptions) {
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
        promptName: true,
        tokenCost: true,
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
      { userId }
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
      if (options.promptModel) {
        await this.ensurePromptCompatRecord({
          name: promptName,
          action: options.promptAction,
          model: options.promptModel,
        });
      }
      nextPromptAction = options.promptAction;
      if (nextPromptAction === undefined) {
        const prompt = await this.db.aiPrompt.findFirst({
          where: { name: promptName },
          select: { action: true },
        });
        if (!prompt) {
          throw new CopilotSessionInvalidInput(
            `Prompt ${promptName} not found or not available for session ${sessionId}`
          );
        }
        nextPromptAction = prompt.action ?? null;
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
      where: { id: sessionId },
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

  @Transactional()
  async cleanup(options: CleanupSessionOptions): Promise<string[]> {
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
    select?: Prisma.AiSessionMessageSelect,
    orderBy?: Prisma.AiSessionMessageOrderByWithRelationInput
  ) {
    return this.db.aiSessionMessage.findMany({
      where: { sessionId },
      select,
      orderBy: orderBy ?? { createdAt: 'asc' },
    });
  }

  @Transactional()
  async getMessage(sessionId: string, messageId: string) {
    const message = await this.db.aiSessionMessage.findFirst({
      where: { id: messageId, sessionId },
      select: {
        id: true,
        compatSubmissionId: true,
        role: true,
        content: true,
        attachments: true,
        streamObjects: true,
        params: true,
        createdAt: true,
      },
    });

    return message ? this.toPublicMessage(message) : null;
  }

  @Transactional()
  async findMessageByCompatSubmissionId(
    sessionId: string,
    compatSubmissionId: string
  ) {
    const message = await this.db.aiSessionMessage.findFirst({
      where: { sessionId, compatSubmissionId },
      select: {
        id: true,
        compatSubmissionId: true,
        role: true,
        content: true,
        attachments: true,
        streamObjects: true,
        params: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return message ? this.toPublicMessage(message) : null;
  }

  private calculateTokenSize(messages: any[], model: string): number {
    const encoder = getTokenEncoder(model);
    const content = messages.map(m => m.content).join('');
    return encoder?.count(content) || 0;
  }

  @Transactional()
  async updateMessages(state: UpdateChatSessionMessage) {
    const { sessionId, userId, messages } = state;
    const haveSession = await this.has(sessionId, userId);
    if (!haveSession) {
      throw new CopilotSessionNotFound();
    }

    if (messages.length) {
      const sanitizedMessages = messages.map(m => this.sanitizeMessage(m));
      const tokenCost = this.calculateTokenSize(
        sanitizedMessages,
        state.prompt.model
      );
      await this.db.aiSessionMessage.createMany({
        data: sanitizedMessages.map(m => ({
          compatSubmissionId: m.compatSubmissionId || undefined,
          role: m.role,
          content: m.content,
          attachments: m.attachments || undefined,
          params: m.params || undefined,
          streamObjects: m.streamObjects || undefined,
          createdAt: m.createdAt,
          sessionId,
        })),
      });

      // only count message generated by user
      const userMessages = sanitizedMessages.filter(m => m.role === 'user');
      await this.db.aiSession.update({
        where: { id: sessionId },
        data: {
          messageCost: { increment: userMessages.length },
          tokenCost: { increment: tokenCost },
        },
      });
    }
  }

  @Transactional()
  async appendMessage(state: {
    sessionId: string;
    userId: string;
    prompt: { model: string };
    message: ChatMessage;
  }) {
    const haveSession = await this.has(state.sessionId, state.userId);
    if (!haveSession) {
      throw new CopilotSessionNotFound();
    }

    const message = this.sanitizeMessage(state.message);
    const tokenCost = this.calculateTokenSize([message], state.prompt.model);

    const created = await this.db.aiSessionMessage.create({
      data: {
        sessionId: state.sessionId,
        compatSubmissionId: message.compatSubmissionId || undefined,
        role: message.role,
        content: message.content,
        attachments: message.attachments || undefined,
        params: message.params || undefined,
        streamObjects: message.streamObjects || undefined,
        createdAt: message.createdAt,
      },
      select: {
        id: true,
        compatSubmissionId: true,
        role: true,
        content: true,
        attachments: true,
        streamObjects: true,
        params: true,
        createdAt: true,
      },
    });

    await this.db.aiSession.update({
      where: { id: state.sessionId },
      data: {
        messageCost:
          message.role === AiPromptRole.user ? { increment: 1 } : undefined,
        tokenCost: { increment: tokenCost },
      },
    });

    return this.toPublicMessage(created);
  }

  @Transactional()
  async trimAfterMessage(
    sessionId: string,
    messageId: string,
    removeTargetMessage = false
  ) {
    const session = await this.getExists(sessionId, {
      id: true,
    });
    if (!session) {
      throw new CopilotSessionNotFound();
    }

    const messages = await this.getMessages(
      sessionId,
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

    await this.db.aiSessionMessage.deleteMany({ where: { id: { in: ids } } });

    const remainingMessages = await this.getMessages(sessionId, {
      role: true,
    });
    const userMessageCount = remainingMessages.filter(message =>
      this.isCountedUserMessage(message)
    ).length;

    if (userMessageCount <= 1) {
      await this.db.aiSession.update({
        where: { id: sessionId },
        data: { title: null },
      });
    }
  }

  @Transactional()
  async revertLatestMessage(
    sessionId: string,
    removeLatestUserMessage: boolean
  ) {
    const session = await this.getExists(sessionId, {
      id: true,
    });
    if (!session) {
      throw new CopilotSessionNotFound();
    }
    const messages = await this.getMessages(session.id, {
      id: true,
      role: true,
      content: true,
    });
    const ids = messages
      .slice(
        messages.findLastIndex(({ role }) => role === AiPromptRole.user) +
          (removeLatestUserMessage ? 0 : 1)
      )
      .map(({ id }) => id);

    if (ids.length) {
      await this.db.aiSessionMessage.deleteMany({ where: { id: { in: ids } } });

      // clear the title if there only one round of conversation left
      const remainingMessages = await this.getMessages(session.id, {
        role: true,
      });
      const userMessageCount = remainingMessages.filter(message =>
        this.isCountedUserMessage(message)
      ).length;

      if (userMessageCount <= 1) {
        await this.db.aiSession.update({
          where: { id: session.id },
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

  async cleanupEmptySessions(earlyThen: Date) {
    // delete never used sessions
    const { count: removed } = await this.db.aiSession.deleteMany({
      where: {
        messageCost: 0,
        deletedAt: null,
        // filter session updated more than 24 hours ago
        updatedAt: { lt: earlyThen },
      },
    });

    // mark empty sessions as deleted
    const { count: cleaned } = await this.db.aiSession.updateMany({
      where: {
        deletedAt: null,
        messages: { none: {} },
        // filter session updated more than 24 hours ago
        updatedAt: { lt: earlyThen },
      },
      data: {
        deletedAt: new Date(),
        pinned: false,
      },
    });

    return { removed, cleaned };
  }

  @Transactional()
  async toBeGenerateTitle() {
    const sessions = await this.db.aiSession
      .findMany({
        where: {
          title: null,
          deletedAt: null,
          messages: { some: {} },
          // only generate titles for non-actions sessions
          ...this.noActionPromptCondition(),
        },
        select: {
          id: true,
          // count assistant messages
          _count: { select: { messages: { where: { role: 'assistant' } } } },
        },
        orderBy: { updatedAt: 'desc' },
      })
      .then(s => s.filter(s => s._count.messages > 0));

    return sessions;
  }
}
