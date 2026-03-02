import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { Prisma, PrismaClient } from '@prisma/client';

import { Config, OnEvent } from '../../../base';
import {
  PromptConfig,
  PromptConfigSchema,
  PromptMessage,
  PromptMessageSchema,
} from '../providers/types';
import { ChatPrompt } from './chat-prompt';
import {
  CopilotPromptScenario,
  type Prompt,
  prompts,
  refreshPrompts,
  Scenario,
} from './prompts';

@Injectable()
export class PromptService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PromptService.name);
  private readonly cache = new Map<string, ChatPrompt>();
  private readonly inMemoryPrompts = new Map<string, Prompt>();

  constructor(
    private readonly config: Config,
    private readonly db: PrismaClient
  ) {}

  async onApplicationBootstrap() {
    this.resetInMemoryPrompts();
    await refreshPrompts(this.db);
  }

  @OnEvent('config.init')
  async onConfigInit() {
    await this.setup(this.config.copilot?.scenarios);
  }

  @OnEvent('config.changed')
  async onConfigChanged(event: Events['config.changed']) {
    if ('copilot' in event.updates) {
      await this.setup(event.updates.copilot?.scenarios);
    }
  }

  protected async setup(scenarios?: CopilotPromptScenario) {
    this.ensureInMemoryPrompts();
    if (!!scenarios && scenarios.override_enabled && scenarios.scenarios) {
      this.logger.log('Updating prompts based on scenarios...');
      for (const [scenario, model] of Object.entries(scenarios.scenarios)) {
        const promptNames = Scenario[scenario as keyof typeof Scenario] || [];
        if (!promptNames.length) continue;
        for (const name of promptNames) {
          const prompt = prompts.find(p => p.name === name);
          if (prompt && model) {
            await this.update(
              prompt.name,
              { model, modified: true },
              { model: { not: model } }
            );
          }
        }
      }
    } else {
      this.logger.log('No scenarios enabled, using default prompts.');
      const prompts = Object.values(Scenario).flat();
      for (const prompt of prompts) {
        await this.update(prompt, { modified: false });
      }
    }
  }

  /**
   * list prompt names
   * @returns prompt names
   */
  async listNames() {
    this.ensureInMemoryPrompts();
    return Array.from(this.inMemoryPrompts.keys());
  }

  async list() {
    this.ensureInMemoryPrompts();
    return Array.from(this.inMemoryPrompts.values())
      .map(prompt => ({
        name: prompt.name,
        action: prompt.action ?? null,
        model: prompt.model,
        config: prompt.config ? structuredClone(prompt.config) : null,
        messages: prompt.messages.map(message => ({
          role: message.role,
          content: message.content,
          params: message.params ?? null,
        })),
      }))
      .sort((a, b) => {
        if (a.action === null && b.action !== null) return -1;
        if (a.action !== null && b.action === null) return 1;
        return (a.action ?? '').localeCompare(b.action ?? '');
      });
  }

  /**
   * get prompt messages by prompt name
   * @param name prompt name
   * @returns prompt messages
   */
  async get(name: string): Promise<ChatPrompt | null> {
    this.ensureInMemoryPrompts();

    // skip cache in dev mode to ensure the latest prompt is always fetched
    if (!env.dev) {
      const cached = this.cache.get(name);
      if (cached) return cached;
    }

    const prompt = this.inMemoryPrompts.get(name);
    if (!prompt) return null;

    const messages = PromptMessageSchema.array().safeParse(prompt.messages);
    const config = PromptConfigSchema.safeParse(prompt.config);
    if (messages.success && config.success) {
      const chatPrompt = ChatPrompt.createFromPrompt({
        ...this.clonePrompt(prompt),
        action: prompt.action ?? null,
        optionalModels: prompt.optionalModels ?? [],
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
    config?: PromptConfig | null,
    extraConfig?: { optionalModels: string[] }
  ) {
    this.ensureInMemoryPrompts();

    const existing = this.inMemoryPrompts.get(name);
    const mergedOptionalModels = existing?.optionalModels
      ? [...existing.optionalModels, ...(extraConfig?.optionalModels ?? [])]
      : extraConfig?.optionalModels;
    const inMemoryConfig = (!!config && structuredClone(config)) || undefined;
    const dbConfig = this.toDbConfig(config);
    this.inMemoryPrompts.set(name, {
      name,
      model,
      action: existing?.action,
      optionalModels: mergedOptionalModels,
      config: inMemoryConfig,
      messages: this.cloneMessages(messages),
    });
    this.cache.delete(name);

    try {
      return await this.db.aiPrompt
        .upsert({
          where: { name },
          create: {
            name,
            action: existing?.action,
            model,
            optionalModels: mergedOptionalModels,
            config: dbConfig,
            messages: {
              create: messages.map((m, idx) => ({
                idx,
                ...m,
                attachments: m.attachments || undefined,
                params: m.params || undefined,
              })),
            },
          },
          update: {
            model,
            optionalModels: mergedOptionalModels,
            config: dbConfig,
            updatedAt: new Date(),
            messages: {
              deleteMany: {},
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
    } catch (error) {
      this.logger.warn(
        `Compat prompt upsert failed for "${name}": ${this.stringifyError(error)}`
      );
      return -1;
    }
  }

  @Transactional()
  async update(
    name: string,
    data: {
      messages?: PromptMessage[];
      model?: string;
      modified?: boolean;
      config?: PromptConfig | null;
    },
    where?: Prisma.AiPromptWhereInput
  ) {
    this.ensureInMemoryPrompts();
    const { config, messages, model, modified } = data;

    const current = this.inMemoryPrompts.get(name);
    if (current) {
      const next = this.clonePrompt(current);
      if (model !== undefined) {
        next.model = model;
      }
      if (config === null) {
        next.config = undefined;
      } else if (config !== undefined) {
        next.config = structuredClone(config);
      }
      if (messages) {
        next.messages = this.cloneMessages(messages);
      }

      this.inMemoryPrompts.set(name, next);
      this.cache.delete(name);
    }

    try {
      const existing = await this.db.aiPrompt
        .count({ where: { ...where, name } })
        .then(count => count > 0);
      if (existing) {
        await this.db.aiPrompt.update({
          where: { name },
          data: {
            config: this.toDbConfig(config),
            updatedAt: new Date(),
            modified,
            model,
            messages: messages
              ? {
                  // cleanup old messages
                  deleteMany: {},
                  create: messages.map((m, idx) => ({
                    idx,
                    ...m,
                    attachments: m.attachments || undefined,
                    params: m.params || undefined,
                  })),
                }
              : undefined,
          },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Compat prompt update failed for "${name}": ${this.stringifyError(error)}`
      );
    }
  }

  async delete(name: string) {
    this.inMemoryPrompts.delete(name);
    this.cache.delete(name);

    try {
      const { id } = await this.db.aiPrompt.delete({ where: { name } });
      return id;
    } catch (error) {
      this.logger.warn(
        `Compat prompt delete failed for "${name}": ${this.stringifyError(error)}`
      );
      return -1;
    }
  }

  private resetInMemoryPrompts() {
    this.cache.clear();
    this.inMemoryPrompts.clear();
    for (const prompt of prompts) {
      this.inMemoryPrompts.set(prompt.name, this.clonePrompt(prompt));
    }
  }

  private ensureInMemoryPrompts() {
    if (!this.inMemoryPrompts.size) {
      this.resetInMemoryPrompts();
    }
  }

  private toDbConfig(
    config: PromptConfig | null | undefined
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (config === null) return Prisma.DbNull;
    if (config === undefined) return undefined;
    return config as Prisma.InputJsonValue;
  }

  private cloneMessages(messages: PromptMessage[]) {
    return messages.map(message => ({
      ...message,
      attachments: message.attachments ? [...message.attachments] : undefined,
      params: message.params ? structuredClone(message.params) : undefined,
    }));
  }

  private clonePrompt(prompt: Prompt): Prompt {
    return {
      ...prompt,
      optionalModels: prompt.optionalModels
        ? [...prompt.optionalModels]
        : undefined,
      config: prompt.config ? structuredClone(prompt.config) : undefined,
      messages: this.cloneMessages(prompt.messages),
    };
  }

  private stringifyError(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
