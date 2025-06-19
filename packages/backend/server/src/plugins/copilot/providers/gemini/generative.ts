import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProvider,
} from '@ai-sdk/google';

import { CopilotProviderType, ModelInputType, ModelOutputType } from '../types';
import { GeminiProvider } from './gemini';

export type GeminiGenerativeConfig = {
  apiKey: string;
  baseUrl?: string;
};

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
      name: 'Text Embedding 004',
      id: 'text-embedding-004',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Embedding],
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
}
