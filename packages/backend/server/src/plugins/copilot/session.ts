import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { ChatPrompt, PromptService } from './prompt';
import {
  AvailableModel,
  ChatHistory,
  ChatMessage,
  ChatMessageSchema,
  getTokenEncoder,
  PromptMessage,
  PromptMessageSchema,
  PromptParams,
} from './types';

export interface ChatSessionOptions {
  userId: string;
  workspaceId: string;
  docId: string;
  promptName: string;
}

export interface ChatSessionState
  extends Omit<ChatSessionOptions, 'promptName'> {
  // connect ids
  sessionId: string;
  // states
  prompt: ChatPrompt;
  messages: ChatMessage[];
}

export type ListHistoriesOptions = {
  action: boolean | undefined;
  limit: number | undefined;
  skip: number | undefined;
  sessionId: string | undefined;
};

export class ChatSession implements AsyncDisposable {
  constructor(
    private readonly state: ChatSessionState,
    private readonly dispose?: (state: ChatSessionState) => Promise<void>,
    private readonly maxTokenSize = 3840
  ) {}

  get model() {
    return this.state.prompt.model;
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
    return [...this.state.prompt.finish(params), ...messages];
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

      await tx.aiSession.upsert({
        where: {
          id: sessionId,
          userId: state.userId,
        },
        update: {
          messages: {
            // delete old messages
            deleteMany: {},
            create: state.messages.map(m => ({
              ...m,
              params: m.params || undefined,
            })),
          },
        },
        create: {
          id: sessionId,
          workspaceId: state.workspaceId,
          docId: state.docId,
          messages: {
            create: state.messages.map(m => ({
              ...m,
              params: m.params || undefined,
            })),
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
          messages: true,
          prompt: {
            select: {
              name: true,
              action: true,
              model: true,
              messages: {
                select: {
                  role: true,
                  content: true,
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

  async countUserActions(userId: string): Promise<number> {
    return await this.db.aiSession.count({
      where: { userId, prompt: { action: { not: null } } },
    });
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
    options?: ListHistoriesOptions
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
          prompt: true,
          messages: {
            select: {
              role: true,
              content: true,
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
        sessions
          .map(({ id, prompt, messages }) => {
            try {
              const ret = PromptMessageSchema.array().safeParse(messages);
              if (ret.success) {
                const tokens = this.calculateTokenSize(
                  ret.data,
                  prompt.model as AvailableModel
                );
                return {
                  sessionId: id,
                  action: prompt.action || undefined,
                  tokens,
                  messages: ret.data,
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
          .filter((v): v is NonNullable<typeof v> => !!v)
      );
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
      return new ChatSession(state, async state => {
        await this.setSession(state);
      });
    }
    return null;
  }
}
