import assert from 'node:assert';

import {
  CopilotCapability,
  CopilotImageToImageProvider,
  CopilotProviderType,
  PromptMessage,
} from '../types';

export type FalConfig = {
  apiKey: string;
};

export type FalResponse = {
  images: Array<{ url: string }>;
};

export class FalProvider implements CopilotImageToImageProvider {
  static readonly type = CopilotProviderType.FAL;
  static readonly capabilities = [CopilotCapability.ImageToImage];

  readonly availableModels = [
    // image to image
    // https://blog.fal.ai/building-applications-with-real-time-stable-diffusion-apis/
    '110602490-lcm-sd15-i2i',
  ];

  constructor(private readonly config: FalConfig) {
    assert(FalProvider.assetsConfig(config));
  }

  static assetsConfig(config: FalConfig) {
    return !!config.apiKey;
  }

  getCapabilities(): CopilotCapability[] {
    return FalProvider.capabilities;
  }

  // ====== image to image ======
  async generateImages(
    messages: PromptMessage[],
    model: string = this.availableModels[0],
    options: {
      signal?: AbortSignal;
      user?: string;
    } = {}
  ): Promise<Array<string>> {
    const { content, attachments } = messages.pop() || {};
    if (!this.availableModels.includes(model)) {
      throw new Error(`Invalid model: ${model}`);
    }
    if (!content) {
      throw new Error('Prompt is required');
    }
    if (!Array.isArray(attachments) || !attachments.length) {
      throw new Error('Attachments is required');
    }

    const data = (await fetch(`https://${model}.gateway.alpha.fal.ai/`, {
      method: 'POST',
      headers: {
        Authorization: `key ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: attachments[0],
        prompt: content,
        sync_mode: true,
        seed: 42,
        enable_safety_checks: false,
      }),
      signal: options.signal,
    }).then(res => res.json())) as FalResponse;

    return data.images.map(image => image.url);
  }

  async *generateImagesStream(
    messages: PromptMessage[],
    model: string = this.availableModels[0],
    options: {
      signal?: AbortSignal;
      user?: string;
    } = {}
  ): AsyncIterable<string> {
    const ret = await this.generateImages(messages, model, options);
    for (const url of ret) {
      yield url;
    }
  }
}
