import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProvider,
} from '@ai-sdk/google';
import z from 'zod';

import {
  CopilotChatOptions,
  CopilotEmbeddingOptions,
  CopilotProviderType,
  ModelConditions,
  ModelInputType,
  ModelOutputType,
  PromptMessage,
  StreamObject,
} from '../types';
import { GeminiProvider } from './gemini';

export type GeminiGenerativeConfig = {
  apiKey: string;
  baseUrl?: string;
  fallback?: {
    text?: string;
    structured?: string;
    image?: string;
    embedding?: string;
  };
};

const ModelListSchema = z.object({
  models: z.array(z.object({ name: z.string() })),
});

export class GeminiGenerativeProvider extends GeminiProvider<GeminiGenerativeConfig> {
  override readonly type = CopilotProviderType.Gemini;

  readonly models = [
    {
      name: 'Gemini 2.0 Flash',
      id: 'gemini-2.0-flash-001',
      capabilities: [
        {
          input: [
            ModelInputType.Text,
            ModelInputType.Image,
            ModelInputType.Audio,
          ],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Structured,
          ],
          defaultForOutputType: true,
        },
      ],
    },
    {
      name: 'Gemini 2.5 Flash',
      id: 'gemini-2.5-flash',
      capabilities: [
        {
          input: [
            ModelInputType.Text,
            ModelInputType.Image,
            ModelInputType.Audio,
          ],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Structured,
          ],
        },
      ],
    },
    {
      name: 'Gemini 2.5 Pro',
      id: 'gemini-2.5-pro',
      capabilities: [
        {
          input: [
            ModelInputType.Text,
            ModelInputType.Image,
            ModelInputType.Audio,
          ],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Structured,
          ],
        },
      ],
    },
    {
      name: 'Gemini Embedding',
      id: 'gemini-embedding-001',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Embedding],
          defaultForOutputType: true,
        },
      ],
    },
  ];

  protected instance!: GoogleGenerativeAIProvider;

  override configured(): boolean {
    return !!this.config.apiKey;
  }

  protected override setup() {
    super.setup();
    this.instance = createGoogleGenerativeAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
    });
  }

  override async text(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): Promise<string> {
    const fullCond = { ...cond, fallbackModel: this.config.fallback?.text };
    return super.text(fullCond, messages, options);
  }

  override async structure(
    cond: ModelConditions,
    messages: PromptMessage[],
    options?: CopilotChatOptions
  ): Promise<string> {
    const fullCond = {
      ...cond,
      fallbackModel: this.config.fallback?.structured,
    };
    return super.structure(fullCond, messages, options);
  }

  override async *streamText(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    const fullCond = { ...cond, fallbackModel: this.config.fallback?.text };
    yield* super.streamText(fullCond, messages, options);
  }

  override async *streamObject(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): AsyncIterable<StreamObject> {
    const fullCond = { ...cond, fallbackModel: this.config.fallback?.text };
    yield* super.streamObject(fullCond, messages, options);
  }

  override async embedding(
    cond: ModelConditions,
    messages: string | string[],
    options?: CopilotEmbeddingOptions
  ): Promise<number[][]> {
    const fullCond = {
      ...cond,
      fallbackModel: this.config.fallback?.embedding,
    };
    return super.embedding(fullCond, messages, options);
  }

  override async refreshOnlineModels() {
    try {
      const baseUrl =
        this.config.baseUrl ||
        'https://generativelanguage.googleapis.com/v1beta';
      if (baseUrl && !this.onlineModelList.length) {
        const { models } = await fetch(
          `${baseUrl}/models?key=${this.config.apiKey}`
        )
          .then(r => r.json())
          .then(
            r => (console.log(JSON.stringify(r)), ModelListSchema.parse(r))
          );
        this.onlineModelList = models.map(model =>
          model.name.replace('models/', '')
        );
      }
    } catch (e) {
      this.logger.error('Failed to fetch available models', e);
    }
  }
}
