import { randomBytes } from 'node:crypto';

import { CopilotProvider } from './provider';
import {
  CopilotCapability,
  CopilotChatOptions,
  CopilotEmbeddingOptions,
  CopilotImageToTextProvider,
  CopilotProviderType,
  CopilotTextToEmbeddingProvider,
  CopilotTextToImageProvider,
  CopilotTextToTextProvider,
  PromptMessage,
} from './types';

export type TestCopilotProviderConfig = {
  enabled: boolean;
};

export class TestCopilotProvider
  extends CopilotProvider<TestCopilotProviderConfig>
  implements
    CopilotTextToTextProvider,
    CopilotTextToEmbeddingProvider,
    CopilotTextToImageProvider,
    CopilotImageToTextProvider
{
  override type = CopilotProviderType.Test;

  override models = [];

  override configured(): boolean {
    return !!this.config.enabled;
  }

  override isModelAvailable(_model: string) {
    return true;
  }

  override readonly capabilities = [
    CopilotCapability.TextToText,
    CopilotCapability.TextToEmbedding,
    CopilotCapability.TextToImage,
    CopilotCapability.ImageToImage,
    CopilotCapability.ImageToText,
  ];

  protected override setup() {
    super.setup();
  }

  // ====== text to text ======

  async generateText(
    _messages: PromptMessage[],
    _model: string = 'test',
    _options: CopilotChatOptions = {}
  ): Promise<string> {
    return 'generate text to text';
  }

  async *generateTextStream(
    _messages: PromptMessage[],
    _model: string = 'gpt-4o-mini',
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    const result = 'generate text to text stream';
    for (const message of result) {
      yield message;
      if (options.signal?.aborted) {
        break;
      }
    }
  }

  // ====== text to embedding ======

  async generateEmbedding(
    messages: string | string[],
    _model: string,
    options: CopilotEmbeddingOptions = { dimensions: 256 }
  ): Promise<number[][]> {
    messages = Array.isArray(messages) ? messages : [messages];

    return [Array.from(randomBytes(options.dimensions)).map(v => v % 128)];
  }

  // ====== text to image ======
  async generateImages(
    messages: PromptMessage[],
    model: string = 'test',
    _options: {
      signal?: AbortSignal;
      user?: string;
    } = {}
  ): Promise<Array<string>> {
    const { content: prompt } = messages[0] || {};
    if (!prompt) {
      throw new Error('Prompt is required');
    }

    // just let test case can easily verify the final prompt
    return [`https://example.com/${model}.jpg`, prompt];
  }

  async *generateImagesStream(
    messages: PromptMessage[],
    model: string = 'dall-e-3',
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
