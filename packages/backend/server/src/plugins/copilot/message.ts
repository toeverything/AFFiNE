import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { SessionCache } from '../../base';
import { SubmittedMessage, SubmittedMessageSchema } from './types';

const CHAT_MESSAGE_KEY = 'chat-message';
const CHAT_MESSAGE_TTL = 3600 * 1 * 1000; // 1 hours

@Injectable()
export class ChatMessageCache {
  constructor(private readonly cache: SessionCache) {}

  async get(id: string): Promise<SubmittedMessage | undefined> {
    return await this.cache.get(`${CHAT_MESSAGE_KEY}:${id}`);
  }

  async set(message: SubmittedMessage): Promise<string> {
    const parsedMessage = SubmittedMessageSchema.parse(message);
    const id = randomUUID();
    await this.cache.set(`${CHAT_MESSAGE_KEY}:${id}`, parsedMessage, {
      ttl: CHAT_MESSAGE_TTL,
    });
    return id;
  }
}
