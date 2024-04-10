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

  private async setSession(state: ChatSessionState): Promise<void> {
    await this.db.aiSession.upsert({
      where: {
        id: state.sessionId,
      },
      update: {
        messages: {
          create: state.messages.map((m, idx) => ({ idx, ...m })),
        },
      },
      create: {
        id: state.sessionId,
        messages: { create: state.messages },
        // connect
        user: { connect: { id: state.userId } },
        workspace: { connect: { id: state.workspaceId } },
        doc: {
          connect: {
            id_workspaceId: {
              id: state.docId,
              workspaceId: state.workspaceId,
            },
          },
        },
        prompt: { connect: { name: state.prompt.name } },
      },
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

  async listHistories(
    workspaceId: string,
    docId: string,
    options: ListHistoriesOptions
  ): Promise<ChatHistory[]> {
    return await this.db.aiSession
      .findMany({
        where: {
          workspaceId: workspaceId,
          docId: workspaceId === docId ? undefined : docId,
          prompt: { action: { not: null } },
          id: options.sessionId ? { equals: options.sessionId } : undefined,
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
        take: options.limit,
        skip: options.skip,
        orderBy: { createdAt: 'desc' },
      })
      .then(sessions =>
        sessions
          .map(({ id, prompt, messages }) => {
            const ret = ChatMessageSchema.array().safeParse(messages);
            if (ret.success) {
              const encoder = getTokenEncoder(prompt.model as AvailableModel);
              const tokens = ret.data
                .map(m => encoder?.encode_ordinary(m.content).length || 0)
                .reduce((total, length) => total + length, 0);
              return { sessionId: id, tokens, messages: ret.data };
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
    await this.setSession({ ...options, sessionId, prompt, messages: [] });
    return sessionId;
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
