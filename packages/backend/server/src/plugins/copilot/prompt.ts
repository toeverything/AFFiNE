import { Injectable } from '@nestjs/common';
import { AiPrompt, PrismaClient } from '@prisma/client';
import Mustache from 'mustache';
import { Tiktoken } from 'tiktoken';

import {
  getTokenEncoder,
  PromptMessage,
  PromptMessageSchema,
  PromptParams,
} from './types';

// disable escaping
Mustache.escape = (text: string) => text;

function extractMustacheParams(template: string) {
  const regex = /\{\{\s*([^{}]+)\s*\}\}/g;
  const params = [];
  let match;

  while ((match = regex.exec(template)) !== null) {
    params.push(match[1]);
  }

  return Array.from(new Set(params));
}

export class ChatPrompt {
  public readonly encoder?: Tiktoken;
  private readonly promptTokenSize: number;
  private readonly templateParamKeys: string[] = [];
  private readonly templateParams: PromptParams = {};

  static createFromPrompt(
    options: Omit<AiPrompt, 'id' | 'createdAt'> & {
      messages: PromptMessage[];
    }
  ) {
    return new ChatPrompt(
      options.name,
      options.action,
      options.model,
      options.messages
    );
  }

  constructor(
    public readonly name: string,
    public readonly action: string | null,
    public readonly model: string | null,
    private readonly messages: PromptMessage[]
  ) {
    this.encoder = getTokenEncoder(model);
    this.promptTokenSize =
      this.encoder?.encode_ordinary(messages.map(m => m.content).join('') || '')
        .length || 0;
    this.templateParamKeys = extractMustacheParams(
      messages.map(m => m.content).join('')
    );
    this.templateParams = messages.reduce(
      (acc, m) => Object.assign(acc, m.params),
      {} as PromptParams
    );
  }

  /**
   * get prompt token size
   */
  get tokens() {
    return this.promptTokenSize;
  }

  /**
   * get prompt param keys in template
   */
  get paramKeys() {
    return this.templateParamKeys.slice();
  }

  /**
   * get prompt params
   */
  get params() {
    return { ...this.templateParams };
  }

  encode(message: string) {
    return this.encoder?.encode_ordinary(message).length || 0;
  }

  private checkParams(params: PromptParams) {
    const selfParams = this.templateParams;
    for (const key of Object.keys(selfParams)) {
      const options = selfParams[key];
      const income = params[key];
      if (
        typeof income !== 'string' ||
        (Array.isArray(options) && !options.includes(income))
      ) {
        throw new Error(`Invalid param: ${key}`);
      }
    }
  }

  /**
   * render prompt messages with params
   * @param params record of params, e.g. { name: 'Alice' }
   * @returns e.g. [{ role: 'system', content: 'Hello, {{name}}' }] => [{ role: 'system', content: 'Hello, Alice' }]
   */
  finish(params: PromptParams) {
    this.checkParams(params);
    return this.messages.map(m => ({
      ...m,
      content: Mustache.render(m.content, params),
    }));
  }

  free() {
    this.encoder?.free();
  }
}

@Injectable()
export class PromptService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * list prompt names
   * @returns prompt names
   */
  async list() {
    return this.db.aiPrompt
      .findMany({ select: { name: true } })
      .then(prompts => Array.from(new Set(prompts.map(p => p.name))));
  }

  /**
   * get prompt messages by prompt name
   * @param name prompt name
   * @returns prompt messages
   */
  async get(name: string): Promise<ChatPrompt | null> {
    return this.db.aiPrompt
      .findUnique({
        where: {
          name,
        },
        select: {
          name: true,
          action: true,
          model: true,
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
      })
      .then(p => {
        const messages = PromptMessageSchema.array().safeParse(p?.messages);
        if (p && messages.success) {
          return ChatPrompt.createFromPrompt({ ...p, messages: messages.data });
        }
        return null;
      });
  }

  async set(name: string, messages: PromptMessage[]) {
    return await this.db.aiPrompt
      .create({
        data: {
          name,
          messages: {
            create: messages.map((m, idx) => ({
              idx,
              ...m,
              params: m.params || undefined,
            })),
          },
        },
      })
      .then(ret => ret.id);
  }

  async update(name: string, messages: PromptMessage[]) {
    return this.db.aiPrompt
      .update({
        where: { name },
        data: {
          messages: {
            // cleanup old messages
            deleteMany: {},
            create: messages.map((m, idx) => ({
              idx,
              ...m,
              params: m.params || undefined,
            })),
          },
        },
      })
      .then(ret => ret.id);
  }

  async delete(name: string) {
    return this.db.aiPrompt.delete({ where: { name } }).then(ret => ret.id);
  }
}
