import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { encoding_for_model, Tiktoken } from 'tiktoken';

import { SessionCache } from '../../fundamentals';
import { PromptService } from './prompt';
import {
  AvailableModel,
  AvailableModels,
  AvailableModelToTiktokenModel,
  ChatHistory,
  ChatMessage,
  ChatMessageSchema,
  PromptMessage,
} from './types';

const CHAT_SESSION_KEY = 'chat-session';
const CHAT_SESSION_TTL = 3600 * 12 * 1000; // 12 hours

export interface ChatSessionOptions {
  // connect ids
  userId: string;
  workspaceId: string;
  docId: string;
  promptName: string;
  // options
  action: boolean;
  model: AvailableModel;
}

export interface ChatSessionState extends ChatSessionOptions {
  // connect ids
  sessionId: string;
  // states
  prompt: PromptMessage[];
  messages: ChatMessage[];
}

export type ListHistoriesOptions = {
  action: boolean | undefined;
  limit: number | undefined;
  skip: number | undefined;
  sessionId: string | undefined;
};

function getTokenEncoder(model: AvailableModel): Tiktoken {
  return encoding_for_model(AvailableModelToTiktokenModel(model));
}

export class ChatSession implements AsyncDisposable {
  private readonly encoder: Tiktoken;
  private readonly promptTokenSize: number;
  constructor(
    private readonly state: ChatSessionState,
    model: AvailableModel,
    private readonly dispose?: (state: ChatSessionState) => Promise<void>,
    private readonly maxTokenSize = 3840
  ) {
    this.encoder = getTokenEncoder(model);
    this.promptTokenSize = this.encoder.encode_ordinary(
      state.prompt?.map(m => m.content).join('') || ''
    ).length;
  }

  get model() {
    return AvailableModels[this.state.model];
  }

  push(message: ChatMessage) {
    if (this.state.action && this.state.messages.length > 0) {
      throw new Error('Action has been taken, no more messages allowed');
    }
    this.state.messages.push(message);
  }

  pop() {
    this.state.messages.pop();
  }

  private takeMessages(): ChatMessage[] {
    if (this.state.action) {
      const messages = this.state.messages;
      return messages.slice(messages.length - 1);
    }
    const ret = [];
    const messages = [...this.state.messages];
    messages.reverse();
    let size = this.promptTokenSize;
    for (const message of messages) {
      const tokenSize = this.encoder.encode_ordinary(message.content).length;
      if (size + tokenSize > this.maxTokenSize) {
        break;
      }
      ret.push(message);
      size += tokenSize;
    }
    ret.reverse();
    return ret;
  }

  finish(): PromptMessage[] {
    const messages = this.takeMessages();
    return [...this.state.prompt, ...messages];
  }

  async save() {
    await this.dispose?.(this.state);
  }

  async [Symbol.asyncDispose]() {
    this.encoder.free();
    await this.save?.();
  }
}

@Injectable()
export class ChatSessionService {
  private readonly logger = new Logger(ChatSessionService.name);
  // NOTE: only used for anonymous session in development
  private readonly unsavedSessions = new Map<string, ChatSessionState>();

  constructor(
    private readonly db: PrismaClient,
    private readonly cache: SessionCache,
    private readonly prompt: PromptService
  ) {}

  private async setSession(state: ChatSessionState): Promise<void> {
    if (
      !state.userId &&
      AFFiNE.node.dev &&
      AFFiNE.featureFlags.copilotAuthorization
    ) {
      // todo(@darkskygit): allow anonymous session in development
      // remove this after the feature is stable
      this.unsavedSessions.set(state.sessionId, state);
      return;
    }
    await this.db.aiSession.upsert({
      where: {
        id: state.sessionId,
      },
      update: {
        messages: state.messages,
      },
      create: {
        id: state.sessionId,
        action: state.action,
        model: state.model,
        messages: state.messages,
        // connect
        user: { connect: { id: state.userId } },
        workspace: { connect: { id: state.workspaceId } },
        doc: {
          connect: {
            id_workspaceId: { id: state.docId, workspaceId: state.workspaceId },
          },
        },
        promptName: state.promptName,
      },
    });
  }

  private async getSession(
    sessionId: string
  ): Promise<ChatSessionState | undefined> {
    return await this.db.aiSession
      .findUnique({
        where: { id: sessionId },
      })
      .then(async session => {
        if (!session) {
          const publishable =
            AFFiNE.node.dev && AFFiNE.featureFlags.copilotAuthorization;
          if (publishable) {
            // todo(@darkskygit): allow anonymous session in development
            // remove this after the feature is stable
            return this.unsavedSessions.get(sessionId);
          }
          return;
        }
        const messages = ChatMessageSchema.array().safeParse(session.messages);

        return {
          sessionId: session.id,
          userId: session.userId,
          workspaceId: session.workspaceId,
          docId: session.docId,
          promptName: session.promptName,
          action: session.action,
          model: session.model as AvailableModel,
          prompt: await this.prompt.get(session.promptName),
          messages: messages.success ? messages.data : [],
        };
      });
  }

  private async setState(state: ChatSessionState): Promise<void> {
    await Promise.all([
      this.cache.set(`${CHAT_SESSION_KEY}:${state.sessionId}`, state, {
        ttl: CHAT_SESSION_TTL,
      }),
      this.setSession(state),
    ]);
  }

  private async getState(
    sessionId: string
  ): Promise<ChatSessionState | undefined> {
    const state = await this.cache.get<ChatSessionState>(
      `${CHAT_SESSION_KEY}:${sessionId}`
    );
    if (state) return state;
    return await this.getSession(sessionId);
  }

  private calculateTokenSize(
    messages: ChatMessage[],
    model: AvailableModel
  ): number {
    const encoder = getTokenEncoder(model);
    return messages.reduce((total, m) => {
      return total + encoder.encode_ordinary(m.content).length;
    }, 0);
  }

  async countSessions(
    userId: string,
    workspaceId: string,
    options?: { docId?: string; action?: boolean }
  ): Promise<number> {
    // NOTE: only used for anonymous session in development
    if (
      !userId &&
      AFFiNE.node.dev &&
      AFFiNE.featureFlags.copilotAuthorization
    ) {
      return this.unsavedSessions.size;
    }
    return await this.db.aiSession.count({
      where: {
        userId,
        workspaceId,
        docId: workspaceId === options?.docId ? undefined : options?.docId,
        action: options?.action,
      },
    });
  }

  async listSessions(
    userId: string | undefined,
    workspaceId: string,
    options?: { docId?: string; action?: boolean }
  ): Promise<string[]> {
    // NOTE: only used for anonymous session in development
    if (
      !userId &&
      AFFiNE.node.dev &&
      AFFiNE.featureFlags.copilotAuthorization
    ) {
      return Array.from(this.unsavedSessions.keys());
    }

    return await this.db.aiSession
      .findMany({
        where: {
          userId,
          workspaceId,
          docId: workspaceId === options?.docId ? undefined : options?.docId,
          action: options?.action,
        },
        select: { id: true },
      })
      .then(sessions => sessions.map(({ id }) => id));
  }

  async listHistories(
    userId: string | undefined,
    workspaceId: string,
    docId?: string,
    options?: ListHistoriesOptions
  ): Promise<ChatHistory[]> {
    // NOTE: only used for anonymous session in development
    if (
      !userId &&
      AFFiNE.node.dev &&
      AFFiNE.featureFlags.copilotAuthorization
    ) {
      return [...this.unsavedSessions.values()].map(state => {
        const tokens = this.calculateTokenSize(state.messages, state.model);
        return {
          sessionId: state.sessionId,
          tokens,
          messages: state.messages,
        };
      });
    }

    return await this.db.aiSession
      .findMany({
        where: {
          userId,
          workspaceId: workspaceId,
          docId: workspaceId === docId ? undefined : docId,
          action: options?.action,
          id: options?.sessionId ? { equals: options.sessionId } : undefined,
        },
        take: options?.limit || 10,
        skip: options?.skip,
        orderBy: { createdAt: 'desc' },
      })
      .then(sessions => {
        return sessions
          .map(({ id, model, messages }) => {
            try {
              const ret = ChatMessageSchema.array().safeParse(messages);
              if (ret.success) {
                const tokens = this.calculateTokenSize(
                  ret.data,
                  model as AvailableModel
                );
                return { sessionId: id, tokens, messages: ret.data };
              }
              return undefined;
            } catch (e) {
              this.logger.error('Unexpected error in listHistories', e);
              return undefined;
            }
          })
          .filter((v): v is NonNullable<typeof v> => !!v);
      });
  }

  async create(options: ChatSessionOptions): Promise<string> {
    const sessionId = randomUUID();
    const prompt = await this.prompt.get(options.promptName);
    if (!prompt.length) {
      this.logger.warn(`Prompt not found: ${options.promptName}`);
    }
    if (!AvailableModels[options.model]) {
      throw new Error(`Invalid model: ${options.model}`);
    }
    await this.setState({
      ...options,
      sessionId,
      prompt,
      messages: [],
    });
    return sessionId;
  }

  /**
   * usage:
   * ``` typescript
   * {
   *     // allocate a session, can be reused chat in about 12 hours with same session
   *     await using session = await session.getOrCreate(sessionId, promptName, model);
   *     session.push(message);
   *     copilot.generateText(session.finish(), model);
   * }
   * // session will be disposed after the block
   * @param sessionId session id
   * @param promptName prompt name
   * @param model model name, used to estimate token size
   * @returns
   */
  async get(sessionId: string): Promise<ChatSession | null> {
    const state = await this.getState(sessionId);
    if (state) {
      return new ChatSession(state, state.model, async state => {
        await this.setState(state);
      });
    }
    return null;
  }
}
