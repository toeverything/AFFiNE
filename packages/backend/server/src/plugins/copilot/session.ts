import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { AiPromptRole, PrismaClient } from '@prisma/client';

import { FeatureManagementService } from '../../core/features';
import { QuotaService } from '../../core/quota';
import {
  CopilotActionTaken,
  CopilotMessageNotFound,
  CopilotPromptNotFound,
  CopilotQuotaExceeded,
  CopilotSessionDeleted,
  CopilotSessionNotFound,
} from '../../fundamentals';
import { ChatMessageCache } from './message';
import { PromptService } from './prompt';
import {
  AvailableModel,
  ChatHistory,
  ChatMessage,
  ChatMessageSchema,
  ChatSessionForkOptions,
  ChatSessionOptions,
  ChatSessionState,
  getTokenEncoder,
  ListHistoriesOptions,
  PromptMessage,
  PromptParams,
  SubmittedMessage,
} from './types';

export class ChatSession implements AsyncDisposable {
  private stashMessageCount = 0;
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
      prompt: { name: promptName, config: promptConfig },
    } = this.state;

    return { sessionId, userId, workspaceId, docId, promptName, promptConfig };
  }

  get stashMessages() {
    if (!this.stashMessageCount) return [];
    return this.state.messages.slice(-this.stashMessageCount);
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

  revertLatestMessage() {
    const messages = this.state.messages;
    messages.splice(
      messages.findLastIndex(({ role }) => role === AiPromptRole.user) + 1
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

  finish(params: PromptParams): PromptMessage[] {
    const messages = this.takeMessages();
    const firstMessage = messages.at(0);
    // if the message in prompt config contains {{content}},
    // we should combine it with the user message in the prompt
    if (
      messages.length === 1 &&
      firstMessage &&
      this.state.prompt.paramKeys.includes('content')
    ) {
      const normalizedParams = {
        ...params,
        ...firstMessage.params,
        content: firstMessage.content,
      };
      const finished = this.state.prompt.finish(
        normalizedParams,
        this.config.sessionId
      );

      // attachments should be combined with the first user message
      const firstUserMessage =
        finished.find(m => m.role === 'user') || finished[0];
      firstUserMessage.attachments = [
        finished[0].attachments || [],
        firstMessage.attachments || [],
      ]
        .flat()
        .filter(v => !!v?.trim());

      return finished;
    }

    return [
      ...this.state.prompt.finish(
        Object.keys(params).length ? params : firstMessage?.params || {},
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
        const extraCondition: Record<string, any> = {};
        if (state.parentSessionId) {
          // also check session id if provided session is forked session
          extraCondition.id = state.sessionId;
          extraCondition.parentSessionId = state.parentSessionId;
        }
        const { id, deletedAt } =
          (await tx.aiSession.findFirst({
            where: {
              userId: state.userId,
              workspaceId: state.workspaceId,
              docId: state.docId,
              prompt: { action: { equals: null } },
              parentSessionId: null,
              ...extraCondition,
            },
            select: { id: true, deletedAt: true },
          })) || {};
        if (deletedAt) throw new CopilotSessionDeleted();
        if (id) sessionId = id;
      }

      const haveSession = await tx.aiSession
        .count({
          where: {
            id: sessionId,
            userId: state.userId,
          },
        })
        .then(c => c > 0);

      if (haveSession) {
        // message will only exists when setSession call by session.save
        if (state.messages.length) {
          await tx.aiSessionMessage.createMany({
            data: state.messages.map(m => ({
              ...m,
              attachments: m.attachments || undefined,
              params: m.params || undefined,
              sessionId,
            })),
          });

          // only count message generated by user
          const userMessages = state.messages.filter(m => m.role === 'user');
          await tx.aiSession.update({
            where: { id: sessionId },
            data: {
              messageCost: { increment: userMessages.length },
              tokenCost: {
                increment: this.calculateTokenSize(
                  userMessages,
                  state.prompt.model as AvailableModel
                ),
              },
            },
          });
        }
      } else {
        await tx.aiSession.create({
          data: {
            id: sessionId,
            workspaceId: state.workspaceId,
            docId: state.docId,
            // connect
            userId: state.userId,
            promptName: state.prompt.name,
            parentSessionId: state.parentSessionId,
          },
        });
      }

      return sessionId;
    });
  }

  private async getSession(
    sessionId: string
  ): Promise<ChatSessionState | undefined> {
    return await this.db.aiSession
      .findUnique({
        where: { id: sessionId, deletedAt: null },
        select: {
          id: true,
          userId: true,
          workspaceId: true,
          docId: true,
          parentSessionId: true,
          messages: {
            select: {
              id: true,
              role: true,
              content: true,
              attachments: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
          },
          promptName: true,
        },
      })
      .then(async session => {
        if (!session) return;
        const prompt = await this.prompt.get(session.promptName);
        if (!prompt)
          throw new CopilotPromptNotFound({ name: session.promptName });

        const messages = ChatMessageSchema.array().safeParse(session.messages);

        return {
          sessionId: session.id,
          userId: session.userId,
          workspaceId: session.workspaceId,
          docId: session.docId,
          parentSessionId: session.parentSessionId,
          prompt,
          messages: messages.success ? messages.data : [],
        };
      });
  }

  // revert the latest messages not generate by user
  // after revert, we can retry the action
  async revertLatestMessage(sessionId: string) {
    await this.db.$transaction(async tx => {
      const id = await tx.aiSession
        .findUnique({
          where: { id: sessionId, deletedAt: null },
          select: { id: true },
        })
        .then(session => session?.id);
      if (!id) {
        throw new CopilotSessionNotFound();
      }
      const ids = await tx.aiSessionMessage
        .findMany({
          where: { sessionId: id },
          select: { id: true, role: true },
          orderBy: { createdAt: 'asc' },
        })
        .then(roles =>
          roles
            .slice(
              roles.findLastIndex(({ role }) => role === AiPromptRole.user) + 1
            )
            .map(({ id }) => id)
        );
      if (ids.length) {
        await tx.aiSessionMessage.deleteMany({ where: { id: { in: ids } } });
      }
    });
  }

  private calculateTokenSize(
    messages: PromptMessage[],
    model: AvailableModel
  ): number {
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
          deletedAt: null,
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
    const extraCondition = [];

    if (!options?.action && options?.fork) {
      // only query forked session if fork == true and action == false
      extraCondition.push({
        userId: { not: userId },
        workspaceId: workspaceId,
        docId: workspaceId === docId ? undefined : docId,
        id: options?.sessionId ? { equals: options.sessionId } : undefined,
        // should only find forked session
        parentSessionId: { not: null },
        deletedAt: null,
      });
    }

    return await this.db.aiSession
      .findMany({
        where: {
          OR: [
            {
              userId,
              workspaceId: workspaceId,
              docId: workspaceId === docId ? undefined : docId,
              id: options?.sessionId
                ? { equals: options.sessionId }
                : undefined,
              deletedAt: null,
            },
            ...extraCondition,
          ],
        },
        select: {
          id: true,
          userId: true,
          promptName: true,
          tokenCost: true,
          createdAt: true,
          messages: {
            select: {
              id: true,
              role: true,
              content: true,
              attachments: true,
              params: true,
              createdAt: true,
            },
            orderBy: {
              // message order is asc by default
              createdAt: options?.messageOrder === 'desc' ? 'desc' : 'asc',
            },
          },
        },
        take: options?.limit,
        skip: options?.skip,
        orderBy: {
          // session order is desc by default
          createdAt: options?.sessionOrder === 'asc' ? 'asc' : 'desc',
        },
      })
      .then(sessions =>
        Promise.all(
          sessions.map(
            async ({
              id,
              userId: uid,
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
                  const preload = withPrompt
                    ? prompt
                        .finish(ret.data[0]?.params || {}, id)
                        .filter(({ role }) => role !== 'system')
                    : [];

                  // `createdAt` is required for history sorting in frontend
                  // let's fake the creating time of prompt messages
                  (preload as ChatMessage[]).forEach((msg, i) => {
                    msg.createdAt = new Date(
                      createdAt.getTime() - preload.length - i - 1
                    );
                  });

                  return {
                    sessionId: id,
                    action: prompt.action || undefined,
                    tokens: tokenCost,
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
            }
          )
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
    return await this.setSession({
      ...options,
      sessionId,
      prompt,
      messages: [],
      // when client create chat session, we always find root session
      parentSessionId: null,
    });
  }

  async fork(options: ChatSessionForkOptions): Promise<string> {
    const state = await this.getSession(options.sessionId);
    if (!state) {
      throw new CopilotSessionNotFound();
    }
    const lastMessageIdx = state.messages.findLastIndex(
      ({ id, role }) =>
        role === AiPromptRole.assistant && id === options.latestMessageId
    );
    if (lastMessageIdx < 0) {
      throw new CopilotMessageNotFound({ messageId: options.latestMessageId });
    }
    const messages = state.messages
      .slice(0, lastMessageIdx + 1)
      .map(m => ({ ...m, id: undefined }));

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
    options: Omit<ChatSessionOptions, 'promptName'> & { sessionIds: string[] }
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
        data: { deletedAt: new Date() },
      });

      return [...sessionIds, ...actionIds];
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
