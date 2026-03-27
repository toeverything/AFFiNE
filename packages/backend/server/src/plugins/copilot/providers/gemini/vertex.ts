import type { NativeLlmBackendConfig } from '../../../../native';
import { GEMINI_ATTACHMENT_CAPABILITY } from '../attachments';
import { CopilotProviderType, ModelInputType, ModelOutputType } from '../types';
import {
  getGoogleAuth,
  VertexModelListSchema,
  type VertexProviderConfig,
} from '../utils';
import { GeminiProvider } from './gemini';

export type GeminiVertexConfig = VertexProviderConfig;

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
      name: 'Gemini 3.1 Flash Lite Preview',
      id: 'gemini-3.1-flash-lite-preview',
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
    return !!this.config.location && !!this.config.googleAuthOptions;
  }

  override async refreshOnlineModels() {
    try {
      const { baseUrl, headers } = await this.resolveVertexAuth();
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

  protected async resolveVertexAuth() {
    return await getGoogleAuth(this.config, 'google');
  }

  protected override async createNativeConfig(): Promise<NativeLlmBackendConfig> {
    const auth = await this.resolveVertexAuth();
    const { Authorization: authHeader } = auth.headers();

    return {
      base_url: auth.baseUrl || '',
      auth_token: authHeader.replace(/^Bearer\s+/i, ''),
      request_layer: 'gemini_vertex',
    };
  }
}
