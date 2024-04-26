import assert from 'node:assert';

import {
  CopilotCapability,
  CopilotImageToImageProvider,
  CopilotProviderType,
  CopilotTextToImageProvider,
  PromptMessage,
} from '../types';

export type FalConfig = {
  apiKey: string;
};

export type FalResponse = {
  detail: Array<{ msg: string }>;
  images: Array<{ url: string }>;
};

export class FalProvider
  implements CopilotTextToImageProvider, CopilotImageToImageProvider
{
  static readonly type = CopilotProviderType.FAL;
  static readonly capabilities = [
    CopilotCapability.TextToImage,
    CopilotCapability.ImageToImage,
  ];

  readonly availableModels = [
    // text to image
    'fast-turbo-diffusion',
    // image to image
    'lcm-sd15-i2i',
  ];

  constructor(private readonly config: FalConfig) {
    assert(FalProvider.assetsConfig(config));
  }

  static assetsConfig(config: FalConfig) {
    return !!config.apiKey;
  }

  get type(): CopilotProviderType {
    return FalProvider.type;
  }

  getCapabilities(): CopilotCapability[] {
    return FalProvider.capabilities;
  }

  isModelAvailable(model: string): boolean {
    return this.availableModels.includes(model);
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

    // prompt attachments require at least one
    if (!content && (!Array.isArray(attachments) || !attachments.length)) {
      throw new Error('Prompt or Attachments is empty');
    }

    const data = (await fetch(`https://fal.run/fal-ai/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `key ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: attachments?.[0],
        prompt: content,
        sync_mode: true,
        seed: 42,
        enable_safety_checks: false,
      }),
      signal: options.signal,
    }).then(res => res.json())) as FalResponse;

    if (!data.images?.length) {
      const error = data.detail?.[0]?.msg;
      throw new Error(
        error ? `Invalid message: ${error}` : 'No images generated'
      );
    }
    return data.images?.map(image => image.url) || [];
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
