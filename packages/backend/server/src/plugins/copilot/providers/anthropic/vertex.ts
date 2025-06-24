import {
  createVertexAnthropic,
  type GoogleVertexAnthropicProvider,
  type GoogleVertexAnthropicProviderSettings,
} from '@ai-sdk/google-vertex/anthropic';

import { CopilotProviderType, ModelInputType, ModelOutputType } from '../types';
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
}
