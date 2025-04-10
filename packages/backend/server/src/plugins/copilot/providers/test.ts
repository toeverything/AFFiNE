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

const FIXED_RESULT: Record<string, string> = {
  'I is a student': 'I am a student',
  '```javascript\nconsloe.log("Hello,World!");\n```\n': 'console',
  'AFFiNE is a workspace with fully merged docs':
    'AFFiNE is a workspace with fully merged docs, ',
  'LLM(AI)': 'Large Language Model',
  Appel: 'Apple',
  Apple: 'Apple Apfel',
  Panda: `
- Panda is a bear-like animal.
  - It is native to China.
    - It is known for its black and white fur.
      - It is a herbivore and primarily eats bamboo.
      - It is a symbol of conservation efforts.
`,
};

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
    messages: PromptMessage[],
    _model: string = 'gpt-4o-mini',
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    console.log(messages);
    const result = messages[1]?.attachments?.length
      ? 'kitten'
      : FIXED_RESULT[messages[0]?.params?.content] ||
        FIXED_RESULT[messages[0]?.content] ||
        messages[0]?.params?.content ||
        messages[0]?.content;
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
