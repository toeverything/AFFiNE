import {
  createVertex,
  type GoogleVertexProvider,
  type GoogleVertexProviderSettings,
} from '@ai-sdk/google-vertex';

import { CopilotProviderType, ModelInputType, ModelOutputType } from '../types';
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
  ];

  protected instance!: GoogleVertexProvider;

  override configured(): boolean {
    return !!this.config.location && !!this.config.googleAuthOptions;
  }

  protected override setup() {
    super.setup();
    this.instance = createVertex(this.config);
  }
}
