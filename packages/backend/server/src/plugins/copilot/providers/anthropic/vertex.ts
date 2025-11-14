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
      name: 'Claude Opus 4',
      id: 'claude-opus-4@20250514',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
        },
      ],
    },
    {
      name: 'Claude Sonnet 4.5',
      id: 'claude-sonnet-4-5@20250929',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
        },
      ],
    },
    {
      name: 'Claude Sonnet 4',
      id: 'claude-sonnet-4@20250514',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
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
