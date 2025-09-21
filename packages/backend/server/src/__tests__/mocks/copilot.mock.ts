import { randomBytes } from 'node:crypto';

import {
  CopilotChatOptions,
  CopilotEmbeddingOptions,
  CopilotImageOptions,
  CopilotStructuredOptions,
  ModelConditions,
  ModelInputType,
  ModelOutputType,
  PromptMessage,
  StreamObject,
} from '../../plugins/copilot/providers';
import {
  DEFAULT_DIMENSIONS,
  OpenAIProvider,
} from '../../plugins/copilot/providers/openai';
import { sleep } from '../utils/utils';

export class MockCopilotProvider extends OpenAIProvider {
  override readonly models = [
    {
      id: 'test',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Text, ModelOutputType.Object],
          defaultForOutputType: true,
        },
      ],
    },
    {
      id: 'test-image',
      capabilities: [
        {
          input: [ModelInputType.Text],
          output: [ModelOutputType.Image],
          defaultForOutputType: true,
        },
      ],
    },
    {
      id: 'gpt-4o',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
        },
      ],
    },
    {
      id: 'gpt-4o-2024-08-06',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
        },
      ],
    },
    {
      id: 'gpt-4.1-2025-04-14',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
        },
      ],
    },
    {
      id: 'gpt-5',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
        },
      ],
    },
    {
      id: 'gpt-5-2025-08-07',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Text, ModelOutputType.Object],
        },
      ],
    },
    {
      id: 'gpt-5-mini',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Structured,
          ],
        },
      ],
    },
    {
      id: 'gpt-image-1',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [ModelOutputType.Image],
          defaultForOutputType: true,
        },
      ],
    },
    {
      id: 'gemini-2.5-flash',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Structured,
          ],
        },
      ],
    },
    {
      id: 'gemini-2.5-pro',
      capabilities: [
        {
          input: [ModelInputType.Text, ModelInputType.Image],
          output: [
            ModelOutputType.Text,
            ModelOutputType.Object,
            ModelOutputType.Structured,
          ],
        },
      ],
    },
  ];

  override async text(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): Promise<string> {
    const fullCond = {
      ...cond,
      outputType: ModelOutputType.Text,
    };
    await this.checkParams({ messages, cond: fullCond, options });
    // make some time gap for history test case
    await sleep(100);
    return 'generate text to text';
  }

  override async *streamText(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    const fullCond = { ...cond, outputType: ModelOutputType.Text };
    await this.checkParams({ messages, cond: fullCond, options });

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

  override async structure(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotStructuredOptions = {}
  ): Promise<string> {
    const fullCond = { ...cond, outputType: ModelOutputType.Structured };
    await this.checkParams({ messages, cond: fullCond, options });

    // make some time gap for history test case
    await sleep(100);
    return 'generate text to text';
  }

  override async *streamImages(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotImageOptions = {}
  ) {
    const fullCond = { ...cond, outputType: ModelOutputType.Image };
    await this.checkParams({ messages, cond: fullCond, options });

    // make some time gap for history test case
    await sleep(100);

    const { content: prompt } = [...messages].pop() || {};
    if (!prompt) throw new Error('Prompt is required');

    const imageUrls = [
      `https://example.com/${cond.modelId || 'test'}.jpg`,
      prompt,
    ];

    for (const imageUrl of imageUrls) {
      yield imageUrl;
      if (options.signal?.aborted) {
        break;
      }
    }
    return;
  }

  // ====== text to embedding ======

  override async embedding(
    cond: ModelConditions,
    messages: string | string[],
    options: CopilotEmbeddingOptions = { dimensions: DEFAULT_DIMENSIONS }
  ): Promise<number[][]> {
    messages = Array.isArray(messages) ? messages : [messages];
    const fullCond = { ...cond, outputType: ModelOutputType.Embedding };
    await this.checkParams({ embeddings: messages, cond: fullCond, options });

    // make some time gap for history test case
    await sleep(100);
    return [Array.from(randomBytes(options.dimensions)).map(v => v % 128)];
  }

  override async *streamObject(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): AsyncIterable<StreamObject> {
    const fullCond = { ...cond, outputType: ModelOutputType.Object };
    await this.checkParams({ messages, cond: fullCond, options });

    // make some time gap for history test case
    await sleep(100);

    const result = 'generate text to object stream';
    for (const data of result) {
      yield { type: 'text-delta', textDelta: data } as const;
      if (options.signal?.aborted) {
        break;
      }
    }
  }
}
