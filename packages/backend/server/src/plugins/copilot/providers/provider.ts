import { Inject, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Tool, ToolSet } from 'ai';
import { z } from 'zod';

import {
  Config,
  CopilotPromptInvalid,
  CopilotProviderNotSupported,
  OnEvent,
} from '../../../base';
import { AccessController } from '../../../core/permission';
import { IndexerService } from '../../indexer';
import { CopilotContextService } from '../context';
import {
  buildDocKeywordSearchGetter,
  buildDocSearchGetter,
  createDocKeywordSearchTool,
  createDocSemanticSearchTool,
  createExaCrawlTool,
  createExaSearchTool,
} from '../tools';
import { CopilotProviderFactory } from './factory';
import {
  type CopilotChatOptions,
  CopilotChatTools,
  type CopilotEmbeddingOptions,
  type CopilotImageOptions,
  CopilotProviderModel,
  CopilotProviderType,
  CopilotStructuredOptions,
  EmbeddingMessage,
  ModelCapability,
  ModelConditions,
  ModelFullConditions,
  ModelInputType,
  type PromptMessage,
  PromptMessageSchema,
  StreamObject,
} from './types';

@Injectable()
export abstract class CopilotProvider<C = any> {
  protected readonly logger = new Logger(this.constructor.name);
  abstract readonly type: CopilotProviderType;
  abstract readonly models: CopilotProviderModel[];
  abstract configured(): boolean;

  @Inject() protected readonly AFFiNEConfig!: Config;
  @Inject() protected readonly factory!: CopilotProviderFactory;
  @Inject() protected readonly moduleRef!: ModuleRef;

  get config(): C {
    return this.AFFiNEConfig.copilot.providers[this.type] as C;
  }

  @OnEvent('config.init')
  async onConfigInit() {
    this.setup();
  }

  @OnEvent('config.changed')
  async onConfigChanged(event: Events['config.changed']) {
    if ('copilot' in event.updates) {
      this.setup();
    }
  }

  protected setup() {
    if (this.configured()) {
      this.factory.register(this);
    } else {
      this.factory.unregister(this);
    }
  }

  private findValidModel(
    cond: ModelFullConditions
  ): CopilotProviderModel | undefined {
    const { modelId, outputType, inputTypes } = cond;
    const matcher = (cap: ModelCapability) =>
      (!outputType || cap.output.includes(outputType)) &&
      (!inputTypes?.length ||
        inputTypes.every(type => cap.input.includes(type)));

    if (modelId) {
      return this.models.find(
        m => m.id === modelId && m.capabilities.some(matcher)
      );
    }
    if (!outputType) return undefined;

    return this.models.find(m =>
      m.capabilities.some(c => matcher(c) && c.defaultForOutputType)
    );
  }

  // make it async to allow dynamic check available models in some providers
  async match(cond: ModelFullConditions = {}): Promise<boolean> {
    return this.configured() && !!this.findValidModel(cond);
  }

  protected selectModel(cond: ModelFullConditions): CopilotProviderModel {
    const model = this.findValidModel(cond);
    if (model) return model;

    const { modelId, outputType, inputTypes } = cond;
    throw new CopilotPromptInvalid(
      modelId
        ? `Model ${modelId} does not support ${outputType ?? '<any>'} output with ${inputTypes ?? '<any>'} input`
        : outputType
          ? `No model supports ${outputType} output with ${inputTypes ?? '<any>'} input for provider ${this.type}`
          : 'Output type is required when modelId is not provided'
    );
  }

  protected getProviderSpecificTools(
    _toolName: CopilotChatTools,
    _model: string
  ): [string, Tool] | undefined {
    return;
  }

  // use for tool use, shared between providers
  protected async getTools(
    options: CopilotChatOptions,
    model: string
  ): Promise<ToolSet> {
    const tools: ToolSet = {};
    if (options?.tools?.length) {
      this.logger.debug(`getTools: ${JSON.stringify(options.tools)}`);
      for (const tool of options.tools) {
        const toolDef = this.getProviderSpecificTools(tool, model);
        if (toolDef) {
          tools[toolDef[0]] = toolDef[1];
          continue;
        }
        switch (tool) {
          case 'docSemanticSearch': {
            const ac = this.moduleRef.get(AccessController, { strict: false });
            const context = this.moduleRef.get(CopilotContextService, {
              strict: false,
            });
            const searchDocs = buildDocSearchGetter(ac, context);
            tools.doc_semantic_search = createDocSemanticSearchTool(
              searchDocs.bind(null, options)
            );
            break;
          }
          case 'docKeywordSearch': {
            if (this.AFFiNEConfig.indexer.enabled) {
              const ac = this.moduleRef.get(AccessController, {
                strict: false,
              });
              const indexerService = this.moduleRef.get(IndexerService, {
                strict: false,
              });
              const searchDocs = buildDocKeywordSearchGetter(
                ac,
                indexerService
              );
              tools.doc_keyword_search = createDocKeywordSearchTool(
                searchDocs.bind(null, options)
              );
            }
            break;
          }
          case 'webSearch': {
            tools.web_search_exa = createExaSearchTool(this.AFFiNEConfig);
            tools.web_crawl_exa = createExaCrawlTool(this.AFFiNEConfig);
            break;
          }
        }
      }
      return tools;
    }
    return tools;
  }

  private handleZodError(ret: z.SafeParseReturnType<any, any>) {
    if (ret.success) return;
    const issues = ret.error.issues.map(i => {
      const path =
        'root' +
        (i.path.length
          ? `.${i.path.map(seg => (typeof seg === 'number' ? `[${seg}]` : `.${seg}`)).join('')}`
          : '');
      return `${i.message}${path}`;
    });
    throw new CopilotPromptInvalid(issues.join('; '));
  }

  protected async checkParams({
    cond,
    messages,
    embeddings,
    options = {},
  }: {
    cond: ModelFullConditions;
    messages?: PromptMessage[];
    embeddings?: string[];
    options?: CopilotChatOptions;
  }) {
    const model = this.selectModel(cond);
    const multimodal = model.capabilities.some(c =>
      [ModelInputType.Image, ModelInputType.Audio].some(t =>
        c.input.includes(t)
      )
    );

    if (messages) {
      const { requireContent = true, requireAttachment = false } = options;

      const MessageSchema = z
        .array(
          PromptMessageSchema.extend({
            content: requireContent
              ? z.string().trim().min(1)
              : z.string().optional().nullable(),
          })
            .passthrough()
            .catchall(z.union([z.string(), z.number(), z.date(), z.null()]))
            .refine(
              m =>
                !(multimodal && requireAttachment && m.role === 'user') ||
                (m.attachments ? m.attachments.length > 0 : true),
              { message: 'attachments required in multimodal mode' }
            )
        )
        .optional();

      this.handleZodError(MessageSchema.safeParse(messages));
    }
    if (embeddings) {
      this.handleZodError(EmbeddingMessage.safeParse(embeddings));
    }
  }

  abstract text(
    model: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotChatOptions
  ): Promise<string>;

  abstract streamText(
    model: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotChatOptions
  ): AsyncIterable<string>;

  streamObject(
    _model: ModelConditions,
    _messages: PromptMessage[],
    _options?: CopilotChatOptions
  ): AsyncIterable<StreamObject> {
    throw new CopilotProviderNotSupported({
      provider: this.type,
      kind: 'object',
    });
  }

  structure(
    _cond: ModelConditions,
    _messages: PromptMessage[],
    _options?: CopilotStructuredOptions
  ): Promise<string> {
    throw new CopilotProviderNotSupported({
      provider: this.type,
      kind: 'structure',
    });
  }

  streamImages(
    _model: ModelConditions,
    _messages: PromptMessage[],
    _options?: CopilotImageOptions
  ): AsyncIterable<string> {
    throw new CopilotProviderNotSupported({
      provider: this.type,
      kind: 'image',
    });
  }

  embedding(
    _model: ModelConditions,
    _text: string | string[],
    _options?: CopilotEmbeddingOptions
  ): Promise<number[][]> {
    throw new CopilotProviderNotSupported({
      provider: this.type,
      kind: 'embedding',
    });
  }
}
