import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { AiPromptRole, PrismaClient } from '@prisma/client';

import {
  CopilotActionTaken,
  CopilotMessageNotFound,
  CopilotPromptNotFound,
  CopilotQuotaExceeded,
  CopilotSessionInvalidInput,
  CopilotSessionNotFound,
} from '../../base';
import { QuotaService } from '../../core/quota';
import {
  ListSessionOptions,
  Models,
  type UpdateChatSession,
  UpdateChatSessionData,
} from '../../models';
import { ChatMessageCache } from './message';
import { PromptService } from './prompt';
import { PromptMessage, PromptParams } from './providers';
import {
  type ChatHistory,
  type ChatMessage,
  ChatMessageSchema,
  type ChatSessionForkOptions,
  type ChatSessionOptions,
  type ChatSessionState,
  getTokenEncoder,
  type SubmittedMessage,
} from './types';

export class ChatSession implements AsyncDisposable {
  private stashMessageCount = 0;
  constructor(
    private readonly messageCache: ChatMessageCache,
    private readonly state: ChatSessionState,
    private readonly dispose?: (state: ChatSessionState) => Promise<void>,
    private readonly maxTokenSize = state.prompt.config?.maxTokens || 128 * 1024
  ) {}

  get model() {
    return this.state.prompt.model;
  }

  get optionalModels() {
    return this.state.prompt.optionalModels;
  }

  get config() {
    const {
      sessionId,
      userId,
      workspaceId,
      docId,
      prompt: { name: promptName, config: promptConfig },
    } = this.state;

    return { sessionId, userId, workspaceId, docId, promptName, promptConfig };
  }

  get stashMessages() {
    if (!this.stashMessageCount) return [];
    return this.state.messages.slice(-this.stashMessageCount);
  }

  get latestUserMessage() {
    return this.state.messages.findLast(m => m.role === 'user');
  }

  push(message: ChatMessage) {
    if (
      this.state.prompt.action &&
      this.state.messages.length > 0 &&
      message.role === 'user'
    ) {
      throw new CopilotActionTaken();
    }
    this.state.messages.push(message);
    this.stashMessageCount += 1;
  }

  revertLatestMessage(removeLatestUserMessage: boolean) {
    const messages = this.state.messages;
    messages.splice(
      messages.findLastIndex(({ role }) => role === AiPromptRole.user) +
        (removeLatestUserMessage ? 0 : 1)
    );
  }

  async getMessageById(messageId: string) {
    const message = await this.messageCache.get(messageId);
    if (!message || message.sessionId !== this.state.sessionId) {
      throw new CopilotMessageNotFound({ messageId });
    }
    return message;
  }

  async pushByMessageId(messageId: string) {
    const message = await this.messageCache.get(messageId);
    if (!message || message.sessionId !== this.state.sessionId) {
      throw new CopilotMessageNotFound({ messageId });
    }

    this.push({
      role: 'user',
      content: message.content || '',
      attachments: message.attachments,
      params: message.params,
      createdAt: new Date(),
    });
  }

  pop() {
    return this.state.messages.pop();
  }

  private takeMessages(): ChatMessage[] {
    if (this.state.prompt.action) {
      const messages = this.state.messages;
      return messages.slice(messages.length - 1);
    }
    const ret = [];
    const messages = this.state.messages.slice();

    let size = this.state.prompt.tokens;
    while (messages.length) {
      const message = messages.pop();
      if (!message) break;

      size += this.state.prompt.encode(message.content);
      if (size > this.maxTokenSize) {
        break;
      }
      ret.push(message);
    }
    ret.reverse();

    return ret;
  }

  private mergeUserContent(params: PromptParams) {
    const messages = this.takeMessages();
    const lastMessage = messages.pop();
    if (
      this.state.prompt.paramKeys.includes('content') &&
      !messages.some(m => m.role === AiPromptRole.assistant) &&
      lastMessage?.role === AiPromptRole.user
    ) {
      const normalizedParams = {
        ...params,
        ...lastMessage.params,
        content: lastMessage.content,
      };
      const finished = this.state.prompt.finish(
        normalizedParams,
        this.config.sessionId
      );

      // attachments should be combined with the first user message
      const firstUserMessageIndex = finished.findIndex(
        m => m.role === AiPromptRole.user
      );
      // if prompt not contains user message, skip merge content
      if (firstUserMessageIndex < 0) return null;
      const firstUserMessage = finished[firstUserMessageIndex];

      firstUserMessage.attachments = [
        finished[0].attachments || [],
        lastMessage.attachments || [],
      ]
        .flat()
        .filter(v =>
          typeof v === 'string'
            ? !!v.trim()
            : v && v.attachment.trim() && v.mimeType
        );
      //insert all previous user message content before first user message
      finished.splice(firstUserMessageIndex, 0, ...messages);

      return finished;
    }
    return;
  }

  finish(params: PromptParams): PromptMessage[] {
    // if the message in prompt config contains {{content}},
    // we should combine it with the user message in the prompt
    const mergedMessage = this.mergeUserContent(params);
    if (mergedMessage) {
      return mergedMessage;
    }

    const messages = this.takeMessages();
    const lastMessage = messages.at(-1);
    return [
      ...this.state.prompt.finish(
        Object.keys(params).length ? params : lastMessage?.params || {},
        this.config.sessionId
      ),
      ...messages.filter(m => m.content?.trim() || m.attachments?.length),
    ];
  }

  async save() {
    await this.dispose?.({
      ...this.state,
      // only provide new messages
      messages: this.stashMessages,
    });
    this.stashMessageCount = 0;
  }

  async [Symbol.asyncDispose]() {
    await this.save?.();
  }
}

@Injectable()
export class ChatSessionService {
  private readonly logger = new Logger(ChatSessionService.name);

  constructor(
    private readonly db: PrismaClient,
    private readonly quota: QuotaService,
    private readonly messageCache: ChatMessageCache,
    private readonly prompt: PromptService,
    private readonly models: Models
  ) {}

  @Transactional()
  private async setSession(state: ChatSessionState): Promise<string> {
    const session = this.models.copilotSession;
    let sessionId = state.sessionId;

    // find existing session if session is chat session
    if (!state.prompt.action) {
      const id = await session.getChatSessionId(state);
      if (id) sessionId = id;
    }

    const haveSession = await session.has(sessionId, state.userId);
    if (haveSession) {
      // message will only exists when setSession call by session.save
      if (state.messages.length) {
        await session.setMessages(
          sessionId,
          state.messages,
          this.calculateTokenSize(state.messages, state.prompt.model)
        );
      }
    } else {
      await session.create({
        ...state,
        sessionId,
        promptName: state.prompt.name,
        promptAction: state.prompt.action ?? null,
      });
    }

    return sessionId;
  }

  async getSession(sessionId: string): Promise<ChatSessionState | undefined> {
    const session = await this.models.copilotSession.get(sessionId);
    if (!session) return;
    const prompt = await this.prompt.get(session.promptName);
    if (!prompt) throw new CopilotPromptNotFound({ name: session.promptName });

    const messages = ChatMessageSchema.array().safeParse(session.messages);

    return {
      sessionId: session.id,
      userId: session.userId,
      workspaceId: session.workspaceId,
      docId: session.docId,
      pinned: session.pinned,
      parentSessionId: session.parentSessionId,
      prompt,
      messages: messages.success ? messages.data : [],
    };
  }

  // revert the latest messages not generate by user
  // after revert, we can retry the action
  async revertLatestMessage(
    sessionId: string,
    removeLatestUserMessage: boolean
  ) {
    await this.models.copilotSession.revertLatestMessage(
      sessionId,
      removeLatestUserMessage
    );
  }

  private calculateTokenSize(messages: PromptMessage[], model: string): number {
    const encoder = getTokenEncoder(model);
    return messages
      .map(m => encoder?.count(m.content) ?? 0)
      .reduce((total, length) => total + length, 0);
  }

  private async countUserMessages(userId: string): Promise<number> {
    const sessions = await this.db.aiSession.findMany({
      where: { userId },
      select: { messageCost: true, prompt: { select: { action: true } } },
    });
    return sessions
      .map(({ messageCost, prompt: { action } }) => (action ? 1 : messageCost))
      .reduce((prev, cost) => prev + cost, 0);
  }

  async listSessions(
    options: ListSessionOptions
  ): Promise<Omit<ChatSessionState, 'messages'>[]> {
    const sessions = await this.models.copilotSession.list({
      ...options,
      withMessages: false,
    });

    return Promise.all(
      sessions.map(async session => {
        const prompt = await this.prompt.get(session.promptName);
        if (!prompt)
          throw new CopilotPromptNotFound({ name: session.promptName });

        return {
          sessionId: session.id,
          userId: session.userId,
          workspaceId: session.workspaceId,
          docId: session.docId,
          pinned: session.pinned,
          parentSessionId: session.parentSessionId,
          prompt,
        };
      })
    );
  }

  async listHistories(options: ListSessionOptions): Promise<ChatHistory[]> {
    const { userId } = options;
    const sessions = await this.models.copilotSession.list({
      ...options,
      withMessages: true,
    });
    const histories = await Promise.all(
      sessions.map(
        async ({
          id,
          userId: uid,
          pinned,
          promptName,
          tokenCost,
          messages,
          createdAt,
        }) => {
          try {
            const prompt = await this.prompt.get(promptName);
            if (!prompt) {
              throw new CopilotPromptNotFound({ name: promptName });
            }
            if (
              // filter out the user's session that not match the action option
              (uid === userId && !!options?.action !== !!prompt.action) ||
              // filter out the non chat session from other user
              (uid !== userId && !!prompt.action)
            ) {
              return undefined;
            }

            const ret = ChatMessageSchema.array().safeParse(messages);
            if (ret.success) {
              // render system prompt
              const preload = (
                options?.withPrompt
                  ? prompt
                      .finish(ret.data[0]?.params || {}, id)
                      .filter(({ role }) => role !== 'system')
                  : []
              ) as ChatMessage[];

              // `createdAt` is required for history sorting in frontend
              // let's fake the creating time of prompt messages
              preload.forEach((msg, i) => {
                msg.createdAt = new Date(
                  createdAt.getTime() - preload.length - i - 1
                );
              });

              return {
                sessionId: id,
                pinned,
                action: prompt.action || null,
                tokens: tokenCost,
                createdAt,
                messages: preload.concat(ret.data).map(m => ({
                  ...m,
                  attachments: m.attachments
                    ?.map(a => (typeof a === 'string' ? a : a.attachment))
                    .filter(a => !!a),
                })),
              };
            } else {
              this.logger.error(
                `Unexpected message schema: ${JSON.stringify(ret.error)}`
              );
            }
          } catch (e) {
            this.logger.error('Unexpected error in listHistories', e);
          }
          return undefined;
        }
      )
    );

    return histories.filter((v): v is NonNullable<typeof v> => !!v);
  }

  async getQuota(userId: string) {
    const isCopilotUser = await this.models.userFeature.has(
      userId,
      'unlimited_copilot'
    );

    let limit: number | undefined;
    if (!isCopilotUser) {
      const quota = await this.quota.getUserQuota(userId);
      limit = quota.copilotActionLimit;
    }

    const used = await this.countUserMessages(userId);

    return { limit, used };
  }

  async checkQuota(userId: string) {
    const { limit, used } = await this.getQuota(userId);
    if (limit && Number.isFinite(limit) && used >= limit) {
      throw new CopilotQuotaExceeded();
    }
  }

  async create(options: ChatSessionOptions): Promise<string> {
    const sessionId = randomUUID();
    const prompt = await this.prompt.get(options.promptName);
    if (!prompt) {
      this.logger.error(`Prompt not found: ${options.promptName}`);
      throw new CopilotPromptNotFound({ name: options.promptName });
    }

    if (options.pinned) {
      await this.unpin(options.workspaceId, options.userId);
    }

    // validate prompt compatibility with session type
    this.models.copilotSession.checkSessionPrompt(
      options,
      prompt.name,
      prompt.action
    );

    return await this.setSession({
      ...options,
      sessionId,
      prompt,
      messages: [],
      // when client create chat session, we always find root session
      parentSessionId: null,
    });
  }

  @Transactional()
  async unpin(workspaceId: string, userId: string) {
    await this.models.copilotSession.unpin(workspaceId, userId);
  }

  @Transactional()
  async updateSession(options: UpdateChatSession): Promise<string> {
    const session = await this.getSession(options.sessionId);
    if (!session) {
      throw new CopilotSessionNotFound();
    }

    const finalData: UpdateChatSessionData = {};
    if (options.promptName) {
      const prompt = await this.prompt.get(options.promptName);
      if (!prompt) {
        this.logger.error(`Prompt not found: ${options.promptName}`);
        throw new CopilotPromptNotFound({ name: options.promptName });
      }

      this.models.copilotSession.checkSessionPrompt(
        session,
        prompt.name,
        prompt.action
      );
      finalData.promptName = prompt.name;
    }
    finalData.pinned = options.pinned;
    finalData.docId = options.docId;

    if (Object.keys(finalData).length === 0) {
      throw new CopilotSessionInvalidInput(
        'No valid fields to update in the session'
      );
    }

    return await this.models.copilotSession.update(
      options.userId,
      options.sessionId,
      finalData
    );
  }

  async fork(options: ChatSessionForkOptions): Promise<string> {
    const state = await this.getSession(options.sessionId);
    if (!state) {
      throw new CopilotSessionNotFound();
    }
    if (state.pinned) {
      await this.unpin(options.workspaceId, options.userId);
    }

    let messages = state.messages.map(m => ({ ...m, id: undefined }));
    if (options.latestMessageId) {
      const lastMessageIdx = state.messages.findLastIndex(
        ({ id, role }) =>
          role === AiPromptRole.assistant && id === options.latestMessageId
      );
      if (lastMessageIdx < 0) {
        throw new CopilotMessageNotFound({
          messageId: options.latestMessageId,
        });
      }
      messages = messages.slice(0, lastMessageIdx + 1);
    }

    const forkedState = {
      ...state,
      userId: options.userId,
      sessionId: randomUUID(),
      messages: [],
      parentSessionId: options.sessionId,
    };
    // create session
    await this.setSession(forkedState);
    // save message
    return await this.setSession({ ...forkedState, messages });
  }

  async cleanup(
    options: Omit<ChatSessionOptions, 'pinned' | 'promptName'> & {
      sessionIds: string[];
    }
  ) {
    return await this.db.$transaction(async tx => {
      const sessions = await tx.aiSession.findMany({
        where: {
          id: { in: options.sessionIds },
          userId: options.userId,
          workspaceId: options.workspaceId,
          docId: options.docId,
          deletedAt: null,
        },
        select: { id: true, promptName: true },
      });
      const sessionIds = sessions.map(({ id }) => id);
      // cleanup all messages
      await tx.aiSessionMessage.deleteMany({
        where: { sessionId: { in: sessionIds } },
      });

      // only mark action session as deleted
      // chat session always can be reuse
      const actionIds = (
        await Promise.all(
          sessions.map(({ id, promptName }) =>
            this.prompt
              .get(promptName)
              .then(prompt => ({ id, action: !!prompt?.action }))
          )
        )
      )
        .filter(({ action }) => action)
        .map(({ id }) => id);

      await tx.aiSession.updateMany({
        where: { id: { in: actionIds } },
        data: { pinned: false, deletedAt: new Date() },
      });

      return [...sessionIds, ...actionIds];
    });
  }

  async createMessage(message: SubmittedMessage): Promise<string> {
    return await this.messageCache.set(message);
  }

  /**
   * usage:
   * ``` typescript
   * {
   *     // allocate a session, can be reused chat in about 12 hours with same session
   *     await using session = await session.get(sessionId);
   *     session.push(message);
   *     copilot.text({ modelId }, session.finish());
   * }
   * // session will be disposed after the block
   * @param sessionId session id
   * @returns
   */
  async get(sessionId: string): Promise<ChatSession | null> {
    const state = await this.getSession(sessionId);
    if (state) {
      return new ChatSession(this.messageCache, state, async state => {
        await this.setSession(state);
      });
    }
    return null;
  }
}
