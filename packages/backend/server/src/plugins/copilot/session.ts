import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Transactional } from '@nestjs-cls/transactional';
import { AiPromptRole } from '@prisma/client';
import { pick } from 'lodash-es';

import {
  CopilotActionTaken,
  CopilotMessageNotFound,
  CopilotPromptNotFound,
  CopilotQuotaExceeded,
  CopilotSessionInvalidInput,
  CopilotSessionNotFound,
  JobQueue,
  NoCopilotProviderAvailable,
  OnJob,
} from '../../base';
import { QuotaService } from '../../core/quota';
import {
  CleanupSessionOptions,
  ListSessionOptions,
  Models,
  type UpdateChatSession,
  UpdateChatSessionOptions,
} from '../../models';
import { SubscriptionService } from '../payment/service';
import { SubscriptionPlan, SubscriptionStatus } from '../payment/types';
import { ChatMessageCache } from './message';
import { ChatPrompt, PromptService } from './prompt';
import {
  CopilotProviderFactory,
  ModelOutputType,
  PromptMessage,
  PromptParams,
} from './providers';
import {
  type ChatHistory,
  type ChatMessage,
  ChatMessageSchema,
  type ChatSessionForkOptions,
  type ChatSessionOptions,
  type ChatSessionState,
  type SubmittedMessage,
} from './types';

declare global {
  interface Jobs {
    'copilot.session.generateTitle': {
      sessionId: string;
    };
    'copilot.session.deleteDoc': {
      workspaceId: string;
      docId: string;
    };
  }
}

export class ChatSession implements AsyncDisposable {
  private stashMessageCount = 0;
  constructor(
    private readonly moduleRef: ModuleRef,
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

  get proModels() {
    return this.state.prompt.config?.proModels || [];
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

  async resolveModel(
    hasPayment: boolean,
    requestedModelId?: string
  ): Promise<string> {
    const defaultModel = this.model;
    const normalize = (m?: string) =>
      !!m && this.optionalModels.includes(m) ? m : defaultModel;
    const isPro = (m?: string) => !!m && this.proModels.includes(m);

    // try resolve payment subscription service lazily
    let paymentEnabled = hasPayment;
    let isUserAIPro = false;
    try {
      if (paymentEnabled) {
        const sub = this.moduleRef.get(SubscriptionService, {
          strict: false,
        });
        const subscription = await sub
          .select(SubscriptionPlan.AI)
          .getSubscription({
            userId: this.config.userId,
            plan: SubscriptionPlan.AI,
          } as any);
        isUserAIPro = subscription?.status === SubscriptionStatus.Active;
      }
    } catch {
      // payment not available -> skip checks
      paymentEnabled = false;
    }

    if (paymentEnabled && !isUserAIPro && isPro(requestedModelId)) {
      return defaultModel;
    }

    return normalize(requestedModelId);
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

type Session = NonNullable<
  Awaited<ReturnType<Models['copilotSession']['get']>>
>;

type SessionHistory = ChatHistory & {
  prompt: ChatPrompt;
};

@Injectable()
export class ChatSessionService {
  private readonly logger = new Logger(ChatSessionService.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly models: Models,
    private readonly jobs: JobQueue,
    private readonly quota: QuotaService,
    private readonly messageCache: ChatMessageCache,
    private readonly prompt: PromptService
  ) {}

  private getMessage(session: Session): ChatMessage[] {
    if (!Array.isArray(session.messages) || !session.messages.length) {
      return [];
    }
    const messages = ChatMessageSchema.array().safeParse(session.messages);
    if (!messages.success) {
      this.logger.error(
        `Unexpected message schema: ${JSON.stringify(messages.error)}`
      );
      return [];
    }
    return messages.data;
  }

  private stripNullBytes(value?: string | null): string {
    if (!value) return '';
    return value.replace(/\u0000/g, '');
  }

  private isNullByteError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes('\\u0000') ||
        error.message.includes('unsupported Unicode escape sequence') ||
        error.message.includes('22P05'))
    );
  }

  private async getHistory(session: Session): Promise<SessionHistory> {
    const prompt = await this.prompt.get(session.promptName);
    if (!prompt) throw new CopilotPromptNotFound({ name: session.promptName });

    return {
      ...pick(session, [
        'userId',
        'workspaceId',
        'docId',
        'parentSessionId',
        'pinned',
        'title',
        'createdAt',
        'updatedAt',
      ]),
      sessionId: session.id,
      tokens: session.tokenCost,
      messages: this.getMessage(session),

      // prompt info
      prompt,
      action: prompt.action || null,
      model: prompt.model,
      optionalModels: prompt.optionalModels || null,
      promptName: prompt.name,
    };
  }

  async getSessionInfo(sessionId: string): Promise<SessionHistory | undefined> {
    const session = await this.models.copilotSession.get(sessionId);
    if (!session) return;

    return await this.getHistory(session);
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

  async count(options: ListSessionOptions): Promise<number> {
    return await this.models.copilotSession.count(options);
  }

  async list(
    options: ListSessionOptions,
    withMessages: boolean
  ): Promise<ChatHistory[]> {
    const { userId: reqUserId } = options;
    const sessions = await this.models.copilotSession.list({
      ...options,
      withMessages,
    });
    const histories = await Promise.all(
      sessions.map(async session => {
        const { userId, id: sessionId, createdAt } = session;
        try {
          const { prompt, messages, ...baseHistory } =
            await this.getHistory(session);

          if (withMessages) {
            if (
              // filter out the user's session that not match the action option
              (userId === reqUserId && !!options?.action !== !!prompt.action) ||
              // filter out the non chat session from other user
              (userId !== reqUserId && !!prompt.action)
            ) {
              return undefined;
            }

            // render system prompt
            const preload = (
              options?.withPrompt
                ? prompt
                    .finish(messages[0]?.params || {}, sessionId)
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
              ...baseHistory,
              messages: preload.concat(messages).map(m => ({
                ...m,
                attachments: m.attachments
                  ?.map(a => (typeof a === 'string' ? a : a.attachment))
                  .filter(a => !!a),
              })),
            };
          } else {
            return { ...baseHistory, messages: [] };
          }
        } catch (e) {
          this.logger.error('Unexpected error in list ChatHistories', e);
        }
        return undefined;
      })
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

    const used = await this.models.copilotSession.countUserMessages(userId);

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
    this.models.copilotSession.checkSessionPrompt(options, prompt);

    return await this.models.copilotSession.createWithPrompt(
      {
        ...options,
        sessionId,
        prompt,
        title: null,
        messages: [],
        // when client create chat session, we always find root session
        parentSessionId: null,
      },
      options.reuseLatestChat ?? true
    );
  }

  @Transactional()
  async unpin(workspaceId: string, userId: string) {
    await this.models.copilotSession.unpin(workspaceId, userId);
  }

  @Transactional()
  async update(options: UpdateChatSession): Promise<string> {
    const session = await this.getSessionInfo(options.sessionId);
    if (!session) {
      throw new CopilotSessionNotFound();
    }

    const finalData: UpdateChatSessionOptions = {
      userId: options.userId,
      sessionId: options.sessionId,
    };
    if (options.promptName) {
      const prompt = await this.prompt.get(options.promptName);
      if (!prompt) {
        this.logger.error(`Prompt not found: ${options.promptName}`);
        throw new CopilotPromptNotFound({ name: options.promptName });
      }

      this.models.copilotSession.checkSessionPrompt(session, prompt);
      finalData.promptName = prompt.name;
    }
    finalData.pinned = options.pinned;
    finalData.docId = options.docId;

    if (Object.keys(finalData).length === 0) {
      throw new CopilotSessionInvalidInput(
        'No valid fields to update in the session'
      );
    }

    return await this.models.copilotSession.update(finalData);
  }

  @Transactional()
  async fork(options: ChatSessionForkOptions): Promise<string> {
    const session = await this.getSessionInfo(options.sessionId);
    if (!session) {
      throw new CopilotSessionNotFound();
    }

    let messages = session.messages.map(m => ({ ...m, id: undefined }));
    if (options.latestMessageId) {
      const lastMessageIdx = session.messages.findLastIndex(
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

    return await this.models.copilotSession.fork({
      ...session,
      userId: options.userId,
      // docId can be changed in fork
      docId: options.docId,
      sessionId: randomUUID(),
      parentSessionId: options.sessionId,
      messages,
    });
  }

  async cleanup(options: CleanupSessionOptions) {
    return await this.models.copilotSession.cleanup(options);
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
    const state = await this.getSessionInfo(sessionId);
    if (state) {
      return new ChatSession(
        this.moduleRef,
        this.messageCache,
        state,
        async state => {
          await this.models.copilotSession.updateMessages(state);
          if (!state.prompt.action) {
            await this.jobs.add('copilot.session.generateTitle', { sessionId });
          }
        }
      );
    }
    return null;
  }

  // public for test mock
  async chatWithPrompt(
    promptName: string,
    message: Partial<PromptMessage>
  ): Promise<string> {
    const prompt = await this.prompt.get(promptName);
    if (!prompt) {
      throw new CopilotPromptNotFound({ name: promptName });
    }

    const cond = { modelId: prompt.model };
    const msg = { role: 'user' as const, content: '', ...message };
    const config = Object.assign({}, prompt.config);

    const provider = await this.moduleRef
      .get(CopilotProviderFactory)
      .getProvider({
        outputType: ModelOutputType.Text,
        modelId: prompt.model,
      });

    if (!provider) {
      throw new NoCopilotProviderAvailable({ modelId: prompt.model });
    }

    return provider.text(cond, [...prompt.finish({}), msg], config);
  }

  @OnJob('copilot.session.deleteDoc')
  async deleteDocSessions(doc: Jobs['copilot.session.deleteDoc']) {
    const sessionIds = await this.models.copilotSession
      .list({
        userId: undefined,
        workspaceId: doc.workspaceId,
        docId: doc.docId,
      })
      .then(s => s.map(s => [s.userId, s.id]));
    for (const [userId, sessionId] of sessionIds) {
      await this.models.copilotSession.update(
        { userId, sessionId, docId: null },
        true
      );
    }
  }

  @OnJob('copilot.session.generateTitle')
  async generateSessionTitle(job: Jobs['copilot.session.generateTitle']) {
    const { sessionId } = job;

    try {
      const session = await this.models.copilotSession.get(sessionId);
      if (!session) {
        this.logger.warn(
          `Session ${sessionId} not found when generating title`
        );
        return;
      }
      const { userId, title } = session;
      const messages =
        session.messages?.map(m => ({
          ...m,
          content: this.stripNullBytes(m.content),
        })) ?? [];

      if (
        title ||
        !messages.length ||
        messages.filter(m => m.role === 'user').length === 0 ||
        messages.filter(m => m.role === 'assistant').length === 0
      ) {
        return;
      }

      const promptContent = messages
        .map(m => `[${m.role}]: ${m.content}`)
        .join('\n');
      const generatedTitle = this.stripNullBytes(
        await this.chatWithPrompt('Summary as title', {
          content: promptContent,
        })
      ).trim();

      if (!generatedTitle) {
        this.logger.warn(
          `Generated empty title for session ${sessionId}, skip updating`
        );
        return;
      }
      await this.models.copilotSession.update({
        userId,
        sessionId,
        title: generatedTitle,
      });
    } catch (error) {
      const context = {
        sessionId,
        cause: error instanceof Error ? error.cause : error,
      };
      if (this.isNullByteError(error)) {
        this.logger.warn(
          `Skip title generation for session ${sessionId} due to invalid null bytes in stored data`,
          context
        );
        return;
      }
      this.logger.error(
        `Failed to generate title for session ${sessionId}:`,
        context
      );
      throw error;
    }
  }
}
