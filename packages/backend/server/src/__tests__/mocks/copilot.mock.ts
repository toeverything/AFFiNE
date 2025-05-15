import { randomBytes } from 'node:crypto';

import {
  CopilotCapability,
  CopilotChatOptions,
  CopilotEmbeddingOptions,
  PromptMessage,
} from '../../plugins/copilot/providers';
import {
  DEFAULT_DIMENSIONS,
  OpenAIProvider,
} from '../../plugins/copilot/providers/openai';
import { sleep } from '../utils/utils';

export class MockCopilotProvider extends OpenAIProvider {
  override readonly models = [
    'test',
    'gpt-4o',
    'gpt-4o-2024-08-06',
    'gpt-4.1',
    'gpt-4.1-2025-04-14',
    'gpt-4.1-mini',
    'fast-sdxl/image-to-image',
    'lcm-sd15-i2i',
    'clarity-upscaler',
    'imageutils/rembg',
    'gemini-2.5-pro-preview-05-06',
  ];

  override readonly capabilities = [
    CopilotCapability.TextToText,
    CopilotCapability.TextToEmbedding,
    CopilotCapability.TextToImage,
    CopilotCapability.ImageToImage,
    CopilotCapability.ImageToText,
  ];

  // ====== text to text ======

  override async generateText(
    messages: PromptMessage[],
    model: string = 'test',
    options: CopilotChatOptions = {}
  ): Promise<string> {
    await this.checkParams({ messages, model, options });
    // make some time gap for history test case
    await sleep(100);
    return 'generate text to text';
  }

  override async *generateTextStream(
    messages: PromptMessage[],
    model: string = 'gpt-4.1-mini',
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    await this.checkParams({ messages, model, options });

    // make some time gap for history test case
    await sleep(100);
    const result = 'generate text to text stream';
    for (const message of result) {
      yield message;
      if (options.signal?.aborted) {
        break;
      }
    }
  }

  // ====== text to embedding ======

  override async generateEmbedding(
    messages: string | string[],
    model: string,
    options: CopilotEmbeddingOptions = { dimensions: DEFAULT_DIMENSIONS }
  ): Promise<number[][]> {
    messages = Array.isArray(messages) ? messages : [messages];
    await this.checkParams({ embeddings: messages, model, options });

    // make some time gap for history test case
    await sleep(100);
    return [Array.from(randomBytes(options.dimensions)).map(v => v % 128)];
  }

  // ====== text to image ======
  override async generateImages(
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

    // make some time gap for history test case
    await sleep(100);
    // just let test case can easily verify the final prompt
    return [`https://example.com/${model}.jpg`, prompt];
  }

  override async *generateImagesStream(
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
