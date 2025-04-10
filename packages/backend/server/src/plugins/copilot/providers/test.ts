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
  LLM: 'Large Language Model',
  Appel: 'Apple',
  Apple: 'Apple Apfel',
  Panda: `
- Panda is a bear-like animal.
  - It is native to China.
    - It is known for its black and white fur.
      - It is a herbivore and primarily eats bamboo.
      - It is a symbol of conservation efforts.
`,
  'Mind Map': `
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

  private getResult(messages: PromptMessage[]) {
    const [first, second] = messages;

    if (first?.attachments?.length || second?.attachments?.length) {
      return 'kitten';
    }

    const rawContent = first?.params?.content || second?.params?.content;
    if (rawContent) {
      return FIXED_RESULT[rawContent] || rawContent;
    }
    const content = first?.content || second?.content;
    if (content) {
      return FIXED_RESULT[content] || content;
    }
    return 'generate text to text';
  }

  async *generateTextStream(
    messages: PromptMessage[],
    _model: string = 'gpt-4o-mini',
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    console.log(messages);
    const result = this.getResult(messages);
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
    _messages: PromptMessage[],
    _model: string = 'test',
    _options: {
      signal?: AbortSignal;
      user?: string;
    } = {}
  ): Promise<Array<string>> {
    return ['data:image/gif;base64,R0lGODlhAQABAAAAACw='];
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
