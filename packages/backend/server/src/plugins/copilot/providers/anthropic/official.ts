import z from 'zod';

import { IMAGE_ATTACHMENT_CAPABILITY } from '../attachments';
import { CopilotProviderType, ModelInputType, ModelOutputType } from '../types';
import { AnthropicProvider } from './anthropic';

export type AnthropicOfficialConfig = {
  apiKey: string;
  baseURL?: string;
};

const ModelListSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
});

export class AnthropicOfficialProvider extends AnthropicProvider<AnthropicOfficialConfig> {
  override readonly type = CopilotProviderType.Anthropic;

  override readonly models = [
    {
      name: 'Claude Opus 4',
      id: 'claude-opus-4-20250514',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
          attachments: IMAGE_ATTACHMENT_CAPABILITY,
        },
      ],
    },
    {
      name: 'Claude Sonnet 4',
      id: 'claude-sonnet-4-5-20250929',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
          attachments: IMAGE_ATTACHMENT_CAPABILITY,
        },
      ],
    },
    {
      name: 'Claude Sonnet 4',
      id: 'claude-sonnet-4-20250514',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
          attachments: IMAGE_ATTACHMENT_CAPABILITY,
        },
      ],
    },
  ];

  override configured(): boolean {
    return !!this.config.apiKey;
  }

  override setup() {
    super.setup();
  }

  override async refreshOnlineModels() {
    try {
      const baseUrl = this.config.baseURL || 'https://api.anthropic.com/v1';
      if (baseUrl && !this.onlineModelList.length) {
        const { data } = await fetch(`${baseUrl}/models`, {
          headers: {
            'x-api-key': this.config.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        })
          .then(r => r.json())
          .then(r => ModelListSchema.parse(r));
        this.onlineModelList = data.map(model => model.id);
      }
    } catch (e) {
      this.logger.error('Failed to fetch available models', e);
    }
  }
}
