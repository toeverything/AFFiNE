import z from 'zod';

import type { NativeLlmBackendConfig } from '../../../../native';
import { GEMINI_ATTACHMENT_CAPABILITY } from '../attachments';
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
      name: 'Gemini 2.5 Flash',
      id: 'gemini-2.5-flash',
      capabilities: [
        {
          input: [
            ModelInputType.Text,
            ModelInputType.Image,
            ModelInputType.Audio,
            ModelInputType.File,
          ],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Structured,
          ],
          attachments: GEMINI_ATTACHMENT_CAPABILITY,
          structuredAttachments: GEMINI_ATTACHMENT_CAPABILITY,
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
            ModelInputType.File,
          ],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Structured,
          ],
          attachments: GEMINI_ATTACHMENT_CAPABILITY,
          structuredAttachments: GEMINI_ATTACHMENT_CAPABILITY,
        },
      ],
    },
    {
      name: 'Gemini 3.1 Pro Preview',
      id: 'gemini-3.1-pro-preview',
      capabilities: [
        {
          input: [
            ModelInputType.Text,
            ModelInputType.Image,
            ModelInputType.Audio,
            ModelInputType.File,
          ],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Structured,
          ],
          attachments: GEMINI_ATTACHMENT_CAPABILITY,
          structuredAttachments: GEMINI_ATTACHMENT_CAPABILITY,
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
  override configured(): boolean {
    return !!this.config.apiKey;
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
        this.onlineModelList = models.map(model =>
          model.name.replace('models/', '')
        );
      }
    } catch (e) {
      this.logger.error('Failed to fetch available models', e);
    }
  }

  protected override async createNativeConfig(): Promise<NativeLlmBackendConfig> {
    return {
      base_url: (
        this.config.baseURL ||
        'https://generativelanguage.googleapis.com/v1beta'
      ).replace(/\/$/, ''),
      auth_token: this.config.apiKey,
      request_layer: 'gemini_api',
    };
  }
}
