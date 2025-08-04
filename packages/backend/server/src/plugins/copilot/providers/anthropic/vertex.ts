import {
  createVertexAnthropic,
  type GoogleVertexAnthropicProvider,
  type GoogleVertexAnthropicProviderSettings,
} from '@ai-sdk/google-vertex/anthropic';

import { CopilotProviderType, ModelInputType, ModelOutputType } from '../types';
import { getGoogleAuth, VertexModelListSchema } from '../utils';
import { AnthropicProvider } from './anthropic';

export type AnthropicVertexConfig = GoogleVertexAnthropicProviderSettings;

export class AnthropicVertexProvider extends AnthropicProvider<AnthropicVertexConfig> {
  override readonly type = CopilotProviderType.AnthropicVertex;

  override readonly models = [
    {
      id: 'claude-opus-4@20250514',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
        },
      ],
    },
    {
      id: 'claude-sonnet-4@20250514',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
        },
      ],
    },
    {
      id: 'claude-3-7-sonnet@20250219',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
        },
      ],
    },
    {
      id: 'claude-3-5-sonnet-v2@20241022',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
          defaultForOutputType: true,
        },
      ],
    },
  ];

  protected instance!: GoogleVertexAnthropicProvider;

  override configured(): boolean {
    return !!this.config.location && !!this.config.googleAuthOptions;
  }

  override setup() {
    super.setup();
    this.instance = createVertexAnthropic(this.config);
  }

  override async refreshOnlineModels() {
    try {
      const { baseUrl, headers } = await getGoogleAuth(
        this.config,
        'anthropic'
      );
      if (baseUrl && !this.onlineModelList.length) {
        const { publisherModels } = await fetch(`${baseUrl}/models`, {
          headers: headers(),
        })
          .then(r => r.json())
          .then(r => VertexModelListSchema.parse(r));
        this.onlineModelList = publisherModels.map(
          model =>
            model.name.replace('publishers/anthropic/models/', '') +
            (model.versionId !== 'default' ? `@${model.versionId}` : '')
        );
      }
    } catch (e) {
      this.logger.error('Failed to fetch available models', e);
    }
  }
}
