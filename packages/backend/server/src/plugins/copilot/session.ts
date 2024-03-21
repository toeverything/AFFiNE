import { Injectable } from '@nestjs/common';
import { encoding_for_model, Tiktoken, TiktokenModel } from 'tiktoken';

import { SessionCache } from '../../fundamentals';
import { PromptService } from './prompt';
import { ChatMessage } from './types';

const CHAT_SESSION_KEY = 'chat-session';
const CHAT_SESSION_TTL = 3600 * 12 * 1000; // 12 hours

type ChatSessionState = {
  promptName: string;
  prompt?: ChatMessage[];
  messages: ChatMessage[];
};

export class ChatSession implements Disposable {
  private readonly encoder: Tiktoken;
  private readonly promptTokenSize: number;
  constructor(
    private readonly state: ChatSessionState,
    model: TiktokenModel,
    private readonly maxTokenSize = 3840
  ) {
    this.encoder = encoding_for_model(model);
    this.promptTokenSize = this.encoder.encode_ordinary(
      state.prompt?.map(m => m.content).join('') || ''
    ).length;
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

  finish() {
    const messages = this.takeMessages();
    return [...(this.state.prompt || []), messages];
  }

  [Symbol.dispose]() {
    this.encoder.free();
  }
}

@Injectable()
export class ChatSessionService {
  constructor(
    private readonly cache: SessionCache,
    private readonly prompt: PromptService
  ) {}

  private async set(
    sessionId: string,
    state: ChatSessionState
  ): Promise<ChatSessionState> {
    const { promptName, messages } = state;
    let { prompt } = state;
    if (!Array.isArray(prompt)) {
      prompt = await this.prompt.get(promptName);
    }
    await this.cache.set(`${CHAT_SESSION_KEY}:${sessionId}`, state, {
      ttl: CHAT_SESSION_TTL,
    });
    return { promptName, prompt, messages };
  }

  private async get(
    sessionId: string,
    model: TiktokenModel
  ): Promise<ChatSession | null> {
    const state = await this.cache.get<ChatSessionState>(
      `${CHAT_SESSION_KEY}:${sessionId}`
    );
    if (state) {
      return new ChatSession(state, model);
    }
    return null;
  }

  /**
   * usage:
   * ``` typescript
   * {
   *     // allocate a session, can be reused chat in about 12 hours with same session
   *     using session = await session.getOrCreate(sessionId, promptName, model);
   *     session.push(message);
   *     copilot.generateText(session.finish(), model);
   * }
   * // session will be disposed after the block
   * @param sessionId session id
   * @param promptName prompt name
   * @param model model name, used to estimate token size
   * @returns
   */
  async getOrCreate(
    sessionId: string,
    promptName: string,
    model: TiktokenModel
  ): Promise<ChatSession> {
    const session = await this.get(sessionId, model);
    if (session) return session;

    const state = await this.set(sessionId, { promptName, messages: [] });
    return new ChatSession(state, model);
  }
}
