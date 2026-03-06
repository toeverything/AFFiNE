import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProvider,
} from '@ai-sdk/google';
import z from 'zod';

import type { ModelCapability } from '../types';
import { CopilotProviderType, ModelInputType, ModelOutputType } from '../types';
import { GeminiProvider } from './gemini';

export type GeminiGenerativeConfig = {
  apiKey: string;
  baseURL?: string;
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

  protected override get defaultOnlineModelCapabilities(): ModelCapability[] {
    return [
      {
        input: [ModelInputType.Text, ModelInputType.Image],
        output: [ModelOutputType.Text, ModelOutputType.Object],
      },
    ];
  }

  override configured(): boolean {
    return !!this.config.apiKey;
  }

  protected override setup() {
    super.setup();
    this.instance = createGoogleGenerativeAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
    });
  }

  override async refreshOnlineModels() {
    try {
      const baseUrl =
        this.config.baseURL ||
        'https://generativelanguage.googleapis.com/v1beta';
      if (baseUrl && !this.onlineModelList.length) {
        const { models } = await fetch(
          `${baseUrl}/models?key=${this.config.apiKey}`
        )
          .then(r => r.json())
          .then(r => ModelListSchema.parse(r));
        this.onlineModelList = models.map(model => ({
          id: model.name.replace('models/', ''),
          capabilities: this.defaultOnlineModelCapabilities,
        }));
      }
    } catch (e) {
      this.logger.error('Failed to fetch available models', e);
    }
  }
}
