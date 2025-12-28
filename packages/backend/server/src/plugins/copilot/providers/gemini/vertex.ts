import {
  createVertex,
  type GoogleVertexProvider,
  type GoogleVertexProviderSettings,
} from '@ai-sdk/google-vertex';

import { CopilotProviderType, ModelInputType, ModelOutputType } from '../types';
import { getGoogleAuth, VertexModelListSchema } from '../utils';
import { GeminiProvider } from './gemini';

export type GeminiVertexConfig = GoogleVertexProviderSettings;

export class GeminiVertexProvider extends GeminiProvider<GeminiVertexConfig> {
  override readonly type = CopilotProviderType.GeminiVertex;

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

  protected instance!: GoogleVertexProvider;

  override configured(): boolean {
    return !!this.config.location && !!this.config.googleAuthOptions;
  }

  protected override setup() {
    super.setup();
    this.instance = createVertex(this.config);
  }

  override async refreshOnlineModels() {
    try {
      const { baseUrl, headers } = await getGoogleAuth(this.config, 'google');
      if (baseUrl && !this.onlineModelList.length) {
        const { publisherModels } = await fetch(`${baseUrl}/models`, {
          headers: headers(),
        })
          .then(r => r.json())
          .then(r => VertexModelListSchema.parse(r));
        this.onlineModelList = publisherModels.map(model =>
          model.name.replace('publishers/google/models/', '')
        );
      }
    } catch (e) {
      this.logger.error('Failed to fetch available models', e);
    }
  }
}
