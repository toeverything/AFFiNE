import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { SessionCache } from '../../fundamentals';
import { SubmittedMessage, SubmittedMessageSchema } from './types';

const CHAT_MESSAGE_KEY = 'chat-message';
const CHAT_MESSAGE_TTL = 3600 * 1 * 1000; // 1 hours

@Injectable()
export class ChatMessageCache {
  private readonly logger = new Logger(ChatMessageCache.name);
  constructor(private readonly cache: SessionCache) {}

  async get(id: string): Promise<SubmittedMessage | undefined> {
    return await this.cache.get(`${CHAT_MESSAGE_KEY}:${id}`);
  }

  async set(message: SubmittedMessage): Promise<string | undefined> {
    try {
      const parsed = SubmittedMessageSchema.safeParse(message);
      if (parsed.success) {
        const id = randomUUID();
        await this.cache.set(`${CHAT_MESSAGE_KEY}:${id}`, parsed.data, {
          ttl: CHAT_MESSAGE_TTL,
        });
        return id;
      }
    } catch (e: any) {
      this.logger.error(`Failed to get chat message from cache: ${e.message}`);
    }
    return undefined;
  }
}
