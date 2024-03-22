import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { encoding_for_model, Tiktoken, TiktokenModel } from 'tiktoken';

import { SessionCache } from '../../fundamentals';
import { PromptService } from './prompt';
import { ChatMessage } from './types';

const CHAT_SESSION_KEY = 'chat-session';
const CHAT_SESSION_TTL = 3600 * 12 * 1000; // 12 hours

export type ChatSessionState = {
  sessionId: string;
  promptName: string;
  model: TiktokenModel;
  prompt: ChatMessage[];
  messages: ChatMessage[];
};

export class ChatSession implements AsyncDisposable {
  private readonly encoder: Tiktoken;
  private readonly promptTokenSize: number;
  constructor(
    private readonly state: ChatSessionState,
    model: TiktokenModel,
    private readonly dispose?: (state: ChatSessionState) => Promise<void>,
    private readonly maxTokenSize = 3840
  ) {
    this.encoder = encoding_for_model(model);
    this.promptTokenSize = this.encoder.encode_ordinary(
      state.prompt?.map(m => m.content).join('') || ''
    ).length;
  }

  get model() {
    return this.state.model;
  }

  push(message: ChatMessage) {
    this.state.messages.push(message);
  }

  pop() {
    this.state.messages.pop();
  }

  private takeMessages(): ChatMessage[] {
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

  finish(): ChatMessage[] {
    const messages = this.takeMessages();
    return [...(this.state.prompt || []), ...messages];
  }

  async save() {
    await this.dispose?.(this.state);
  }

  async [Symbol.asyncDispose]() {
    this.encoder.free();
    await this.save?.();
  }
}

export interface ChatSessionOptions {
  promptName: string;
  model: TiktokenModel;
  user?: string;
}

@Injectable()
export class ChatSessionService {
  constructor(
    private readonly cache: SessionCache,
    private readonly prompt: PromptService
  ) {}

  private async setState(state: ChatSessionState): Promise<void> {
    await this.cache.set(`${CHAT_SESSION_KEY}:${state.sessionId}`, state, {
      ttl: CHAT_SESSION_TTL,
    });
  }

  private async getState(
    sessionId: string
  ): Promise<ChatSessionState | undefined> {
    return await this.cache.get<ChatSessionState>(
      `${CHAT_SESSION_KEY}:${sessionId}`
    );
  }

  async create(options: ChatSessionOptions): Promise<string> {
    const sessionId = randomUUID();
    const prompt = await this.prompt.get(options.promptName);
    if (!prompt.length) {
      throw new Error(`Prompt not found: ${options.promptName}`);
    }
    await this.setState({
      sessionId,
      model: options.model,
      promptName: options.promptName,
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
