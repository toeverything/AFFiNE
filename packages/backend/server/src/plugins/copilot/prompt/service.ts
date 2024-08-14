import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import {
  PromptConfig,
  PromptConfigSchema,
  PromptMessage,
  PromptMessageSchema,
} from '../types';
import { ChatPrompt } from './chat-prompt';
import { refreshPrompts } from './prompts';

@Injectable()
export class PromptService implements OnModuleInit {
  private readonly cache = new Map<string, ChatPrompt>();

  constructor(private readonly db: PrismaClient) {}

  async onModuleInit() {
    await refreshPrompts(this.db);
  }

  /**
   * list prompt names
   * @returns prompt names
   */
  async listNames() {
    return this.db.aiPrompt
      .findMany({ select: { name: true } })
      .then(prompts => Array.from(new Set(prompts.map(p => p.name))));
  }

  async list() {
    return this.db.aiPrompt.findMany({
      select: {
        name: true,
        action: true,
        model: true,
        config: true,
        messages: {
          select: { role: true, content: true, params: true },
          orderBy: { idx: 'asc' },
        },
      },
      orderBy: { action: { sort: 'asc', nulls: 'first' } },
    });
  }

  /**
   * get prompt messages by prompt name
   * @param name prompt name
   * @returns prompt messages
   */
  async get(name: string): Promise<ChatPrompt | null> {
    const cached = this.cache.get(name);
    if (cached) return cached;

    const prompt = await this.db.aiPrompt.findUnique({
      where: {
        name,
      },
      select: {
        name: true,
        action: true,
        model: true,
        config: true,
        messages: {
          select: {
            role: true,
            content: true,
            params: true,
          },
          orderBy: {
            idx: 'asc',
          },
        },
      },
    });

    const messages = PromptMessageSchema.array().safeParse(prompt?.messages);
    const config = PromptConfigSchema.safeParse(prompt?.config);
    if (prompt && messages.success && config.success) {
      const chatPrompt = ChatPrompt.createFromPrompt({
        ...prompt,
        config: config.data,
        messages: messages.data,
      });
      this.cache.set(name, chatPrompt);
      return chatPrompt;
    }
    return null;
  }

  async set(
    name: string,
    model: string,
    messages: PromptMessage[],
    config?: PromptConfig | null
  ) {
    return await this.db.aiPrompt
      .create({
        data: {
          name,
          model,
          config: config || undefined,
          messages: {
            create: messages.map((m, idx) => ({
              idx,
              ...m,
              attachments: m.attachments || undefined,
              params: m.params || undefined,
            })),
          },
        },
      })
      .then(ret => ret.id);
  }

  async update(
    name: string,
    messages: PromptMessage[],
    modifyByApi: boolean = false,
    config?: PromptConfig
  ) {
    const { id } = await this.db.aiPrompt.update({
      where: { name },
      data: {
        config: config || undefined,
        updatedAt: new Date(),
        modified: modifyByApi,
        messages: {
          // cleanup old messages
          deleteMany: {},
          create: messages.map((m, idx) => ({
            idx,
            ...m,
            attachments: m.attachments || undefined,
            params: m.params || undefined,
          })),
        },
      },
    });

    this.cache.delete(name);
    return id;
  }

  async delete(name: string) {
    const { id } = await this.db.aiPrompt.delete({ where: { name } });
    this.cache.delete(name);
    return id;
  }
}
