import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { AiPromptRole, PrismaClient } from '@prisma/client';

import { FeatureManagementService } from '../../core/features';
import { QuotaService } from '../../core/quota';
import { PaymentRequiredException } from '../../fundamentals';
import { ChatMessageCache } from './message';
import { ChatPrompt, PromptService } from './prompt';
import {
  AvailableModel,
  ChatHistory,
  ChatMessage,
  ChatMessageSchema,
  ChatSessionOptions,
  ChatSessionState,
  getTokenEncoder,
  ListHistoriesOptions,
  PromptMessage,
  PromptParams,
  SubmittedMessage,
} from './types';

export class ChatSession implements AsyncDisposable {
  constructor(
    private readonly messageCache: ChatMessageCache,
    private readonly state: ChatSessionState,
    private readonly dispose?: (state: ChatSessionState) => Promise<void>,
    private readonly maxTokenSize = 3840
  ) {}

  get model() {
    return this.state.prompt.model;
  }

  get config() {
    const {
      sessionId,
      userId,
      workspaceId,
      docId,
      prompt: { name: promptName },
    } = this.state;

    return { sessionId, userId, workspaceId, docId, promptName };
  }

  push(message: ChatMessage) {
    if (
      this.state.prompt.action &&
      this.state.messages.length > 0 &&
      message.role === 'user'
    ) {
      throw new Error('Action has been taken, no more messages allowed');
    }
    this.state.messages.push(message);
  }

  async getMessageById(messageId: string) {
    const message = await this.messageCache.get(messageId);
    if (!message || message.sessionId !== this.state.sessionId) {
      throw new Error(`Message not found: ${messageId}`);
    }
    return message;
  }

  async pushByMessageId(messageId: string) {
    const message = await this.messageCache.get(messageId);
    if (!message || message.sessionId !== this.state.sessionId) {
      throw new Error(`Message not found: ${messageId}`);
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
    this.state.messages.pop();
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

  finish(params: PromptParams): PromptMessage[] {
    const messages = this.takeMessages();
    return [
      ...this.state.prompt.finish(
        Object.keys(params).length ? params : messages[0]?.params || {},
        this.config.sessionId
      ),
      ...messages.filter(m => m.content || m.attachments?.length),
    ];
  }

  async save() {
    await this.dispose?.(this.state);
  }

  async [Symbol.asyncDispose]() {
    this.state.prompt.free();
    await this.save?.();
  }
}

@Injectable()
export class ChatSessionService {
  private readonly logger = new Logger(ChatSessionService.name);

  constructor(
    private readonly db: PrismaClient,
    private readonly feature: FeatureManagementService,
    private readonly quota: QuotaService,
    private readonly messageCache: ChatMessageCache,
    private readonly prompt: PromptService
  ) {}

  private async setSession(state: ChatSessionState): Promise<string> {
    return await this.db.$transaction(async tx => {
      let sessionId = state.sessionId;

      // find existing session if session is chat session
      if (!state.prompt.action) {
        const { id } =
          (await tx.aiSession.findFirst({
            where: {
              userId: state.userId,
              workspaceId: state.workspaceId,
              docId: state.docId,
              prompt: { action: { equals: null } },
            },
            select: { id: true },
          })) || {};
        if (id) sessionId = id;
      }

      const messages = state.messages.map(m => ({
        ...m,
        attachments: m.attachments || undefined,
        params: m.params || undefined,
      }));

      await tx.aiSession.upsert({
        where: {
          id: sessionId,
          userId: state.userId,
        },
        update: {
          messages: {
            // skip delete old messages if no new messages
            deleteMany: messages.length ? {} : undefined,
            create: messages,
          },
        },
        create: {
          id: sessionId,
          workspaceId: state.workspaceId,
          docId: state.docId,
          messages: {
            create: messages,
          },
          // connect
          user: { connect: { id: state.userId } },
          prompt: { connect: { name: state.prompt.name } },
        },
      });
      return sessionId;
    });
  }

  private async getSession(
    sessionId: string
  ): Promise<ChatSessionState | undefined> {
    return await this.db.aiSession
      .findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          userId: true,
          workspaceId: true,
          docId: true,
          messages: {
            select: {
              role: true,
              content: true,
              createdAt: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
          prompt: {
            select: {
              name: true,
              action: true,
              model: true,
              messages: {
                select: {
                  role: true,
                  content: true,
                  createdAt: true,
                },
                orderBy: {
                  idx: 'asc',
                },
              },
            },
          },
        },
      })
      .then(async session => {
        if (!session) return;

        const messages = ChatMessageSchema.array().safeParse(session.messages);

        return {
          sessionId: session.id,
          userId: session.userId,
          workspaceId: session.workspaceId,
          docId: session.docId,
          prompt: ChatPrompt.createFromPrompt(session.prompt),
          messages: messages.success ? messages.data : [],
        };
      });
  }

  private calculateTokenSize(
    messages: PromptMessage[],
    model: AvailableModel
  ): number {
    const encoder = getTokenEncoder(model);
    return messages
      .map(m => encoder?.encode_ordinary(m.content).length || 0)
      .reduce((total, length) => total + length, 0);
  }

  private async countUserActions(userId: string): Promise<number> {
    return await this.db.aiSession.count({
      where: { userId, prompt: { action: { not: null } } },
    });
  }

  private async countUserChats(userId: string): Promise<number> {
    const chats = await this.db.aiSession.findMany({
      where: { userId, prompt: { action: null } },
      select: {
        _count: {
          select: { messages: { where: { role: AiPromptRole.user } } },
        },
      },
    });
    return chats.reduce((prev, chat) => prev + chat._count.messages, 0);
  }

  async listSessions(
    userId: string,
    workspaceId: string,
    options?: { docId?: string; action?: boolean }
  ): Promise<string[]> {
    return await this.db.aiSession
      .findMany({
        where: {
          userId,
          workspaceId,
          docId: workspaceId === options?.docId ? undefined : options?.docId,
          prompt: {
            action: options?.action ? { not: null } : null,
          },
        },
        select: { id: true },
      })
      .then(sessions => sessions.map(({ id }) => id));
  }

  async listHistories(
    userId: string,
    workspaceId?: string,
    docId?: string,
    options?: ListHistoriesOptions,
    withPrompt = false
  ): Promise<ChatHistory[]> {
    return await this.db.aiSession
      .findMany({
        where: {
          userId,
          workspaceId: workspaceId,
          docId: workspaceId === docId ? undefined : docId,
          prompt: {
            action: options?.action ? { not: null } : null,
          },
          id: options?.sessionId ? { equals: options.sessionId } : undefined,
        },
        select: {
          id: true,
          promptName: true,
          createdAt: true,
          messages: {
            select: {
              role: true,
              content: true,
              attachments: true,
              params: true,
              createdAt: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
        take: options?.limit,
        skip: options?.skip,
        orderBy: { createdAt: 'desc' },
      })
      .then(sessions =>
        Promise.all(
          sessions.map(async ({ id, promptName, messages, createdAt }) => {
            try {
              const ret = ChatMessageSchema.array().safeParse(messages);
              if (ret.success) {
                const prompt = await this.prompt.get(promptName);
                if (!prompt) {
                  throw new Error(`Prompt not found: ${promptName}`);
                }
                const tokens = this.calculateTokenSize(
                  ret.data,
                  prompt.model as AvailableModel
                );

                // render system prompt
                const preload = withPrompt
                  ? prompt
                      .finish(ret.data[0]?.params || {}, id)
                      .filter(({ role }) => role !== 'system')
                  : [];

                // `createdAt` is required for history sorting in frontend, let's fake the creating time of prompt messages
                (preload as ChatMessage[]).forEach((msg, i) => {
                  msg.createdAt = new Date(
                    createdAt.getTime() - preload.length - i - 1
                  );
                });

                return {
                  sessionId: id,
                  action: prompt.action || undefined,
                  tokens,
                  createdAt,
                  messages: preload.concat(ret.data),
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
          })
        )
      )
      .then(histories =>
        histories.filter((v): v is NonNullable<typeof v> => !!v)
      );
  }

  async getQuota(userId: string) {
    const isCopilotUser = await this.feature.isCopilotUser(userId);

    let limit: number | undefined;
    if (!isCopilotUser) {
      const quota = await this.quota.getUserQuota(userId);
      limit = quota.feature.copilotActionLimit;
    }

    const actions = await this.countUserActions(userId);
    const chats = await this.countUserChats(userId);

    return { limit, used: actions + chats };
  }

  async checkQuota(userId: string) {
    const { limit, used } = await this.getQuota(userId);
    if (limit && Number.isFinite(limit) && used >= limit) {
      throw new PaymentRequiredException(
        `You have reached the limit of actions in this workspace, please upgrade your plan.`
      );
    }
  }

  async create(options: ChatSessionOptions): Promise<string> {
    const sessionId = randomUUID();
    const prompt = await this.prompt.get(options.promptName);
    if (!prompt) {
      this.logger.error(`Prompt not found: ${options.promptName}`);
      throw new Error('Prompt not found');
    }
    return await this.setSession({
      ...options,
      sessionId,
      prompt,
      messages: [],
    });
  }

  async createMessage(message: SubmittedMessage): Promise<string | undefined> {
    return await this.messageCache.set(message);
  }

  /**
   * usage:
   * ``` typescript
   * {
   *     // allocate a session, can be reused chat in about 12 hours with same session
   *     await using session = await session.get(sessionId);
   *     session.push(message);
   *     copilot.generateText(session.finish(), model);
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
