import { randomBytes } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  DEFAULT_DIMENSIONS,
  OpenAIProvider,
} from '../../src/plugins/copilot/providers/openai';
import {
  CopilotCapability,
  CopilotChatOptions,
  CopilotEmbeddingOptions,
  CopilotImageToImageProvider,
  CopilotImageToTextProvider,
  CopilotProviderType,
  CopilotTextToEmbeddingProvider,
  CopilotTextToImageProvider,
  CopilotTextToTextProvider,
  PromptConfig,
  PromptMessage,
} from '../../src/plugins/copilot/types';
import { NodeExecutorType } from '../../src/plugins/copilot/workflow/executor';
import {
  WorkflowGraph,
  WorkflowNodeType,
  WorkflowParams,
} from '../../src/plugins/copilot/workflow/types';
import { gql } from './common';
import { handleGraphQLError, sleep } from './utils';

// @ts-expect-error no error
export class MockCopilotTestProvider
  extends OpenAIProvider
  implements
    CopilotTextToTextProvider,
    CopilotTextToEmbeddingProvider,
    CopilotTextToImageProvider,
    CopilotImageToImageProvider,
    CopilotImageToTextProvider
{
  static override readonly type = CopilotProviderType.Test;
  override readonly availableModels = [
    'test',
    'gpt-4o',
    'fast-sdxl/image-to-image',
    'lcm-sd15-i2i',
    'clarity-upscaler',
    'imageutils/rembg',
  ];
  static override readonly capabilities = [
    CopilotCapability.TextToText,
    CopilotCapability.TextToEmbedding,
    CopilotCapability.TextToImage,
    CopilotCapability.ImageToImage,
    CopilotCapability.ImageToText,
  ];

  constructor() {
    super({ apiKey: '1' });
  }

  override getCapabilities(): CopilotCapability[] {
    return MockCopilotTestProvider.capabilities;
  }

  static override assetsConfig(_config: any) {
    return true;
  }

  override get type(): CopilotProviderType {
    return CopilotProviderType.Test;
  }

  override async isModelAvailable(model: string): Promise<boolean> {
    return this.availableModels.includes(model);
  }

  // ====== text to text ======

  override async generateText(
    messages: PromptMessage[],
    model: string = 'test',
    options: CopilotChatOptions = {}
  ): Promise<string> {
    this.checkParams({ messages, model, options });
    // make some time gap for history test case
    await sleep(100);
    return 'generate text to text';
  }

  override async *generateTextStream(
    messages: PromptMessage[],
    model: string = 'gpt-4o-mini',
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    this.checkParams({ messages, model, options });

    // make some time gap for history test case
    await sleep(100);
    const result = 'generate text to text stream';
    for await (const message of result) {
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
    this.checkParams({ embeddings: messages, model, options });

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

export async function createCopilotSession(
  app: INestApplication,
  userToken: string,
  workspaceId: string,
  docId: string,
  promptName: string
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(userToken, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
        mutation createCopilotSession($options: CreateChatSessionInput!) {
          createCopilotSession(options: $options)
        }
      `,
      variables: { options: { workspaceId, docId, promptName } },
    })
    .expect(200);

  handleGraphQLError(res);

  return res.body.data.createCopilotSession;
}

export async function forkCopilotSession(
  app: INestApplication,
  userToken: string,
  workspaceId: string,
  docId: string,
  sessionId: string,
  latestMessageId: string
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(userToken, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
        mutation forkCopilotSession($options: ForkChatSessionInput!) {
          forkCopilotSession(options: $options)
        }
      `,
      variables: {
        options: { workspaceId, docId, sessionId, latestMessageId },
      },
    })
    .expect(200);

  handleGraphQLError(res);

  return res.body.data.forkCopilotSession;
}

export async function createCopilotMessage(
  app: INestApplication,
  userToken: string,
  sessionId: string,
  content?: string,
  attachments?: string[],
  blobs?: ArrayBuffer[],
  params?: Record<string, string>
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(userToken, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
        mutation createCopilotMessage($options: CreateChatMessageInput!) {
          createCopilotMessage(options: $options)
        }
      `,
      variables: {
        options: { sessionId, content, attachments, blobs, params },
      },
    })
    .expect(200);

  handleGraphQLError(res);

  return res.body.data.createCopilotMessage;
}

export async function chatWithText(
  app: INestApplication,
  userToken: string,
  sessionId: string,
  messageId?: string,
  prefix = ''
): Promise<string> {
  const query = messageId ? `?messageId=${messageId}` : '';
  const res = await request(app.getHttpServer())
    .get(`/api/copilot/chat/${sessionId}${prefix}${query}`)
    .auth(userToken, { type: 'bearer' })
    .expect(200);

  return res.text;
}

export async function chatWithTextStream(
  app: INestApplication,
  userToken: string,
  sessionId: string,
  messageId?: string
) {
  return chatWithText(app, userToken, sessionId, messageId, '/stream');
}

export async function chatWithWorkflow(
  app: INestApplication,
  userToken: string,
  sessionId: string,
  messageId?: string
) {
  return chatWithText(app, userToken, sessionId, messageId, '/workflow');
}

export async function chatWithImages(
  app: INestApplication,
  userToken: string,
  sessionId: string,
  messageId?: string
) {
  return chatWithText(app, userToken, sessionId, messageId, '/images');
}

export function sse2array(eventSource: string) {
  const blocks = eventSource.replace(/^\n(.*?)\n$/, '$1').split(/\n\n+/);
  return blocks.map(block =>
    block.split('\n').reduce(
      (prev, curr) => {
        const [key, ...values] = curr.split(': ');
        return Object.assign(prev, { [key]: values.join(': ') });
      },
      {} as Record<string, string>
    )
  );
}

export function array2sse(blocks: Record<string, string>[]) {
  return blocks
    .map(
      e =>
        '\n' +
        Object.entries(e)
          .filter(([k]) => !!k)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')
    )
    .join('\n');
}

export function textToEventStream(
  content: string | string[],
  id: string,
  event = 'message'
): string {
  return (
    Array.from(content)
      .map(x => `\nevent: ${event}\nid: ${id}\ndata: ${x}`)
      .join('\n') + '\n\n'
  );
}

type ChatMessage = {
  id?: string;
  role: string;
  content: string;
  attachments: string[] | null;
  createdAt: string;
};

type History = {
  sessionId: string;
  tokens: number;
  action: string | null;
  createdAt: string;
  messages: ChatMessage[];
};

export async function getHistories(
  app: INestApplication,
  userToken: string,
  variables: {
    workspaceId: string;
    docId?: string;
    options?: {
      action?: boolean;
      fork?: boolean;
      limit?: number;
      skip?: number;
      sessionOrder?: 'asc' | 'desc';
      messageOrder?: 'asc' | 'desc';
      sessionId?: string;
    };
  }
): Promise<History[]> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(userToken, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
      query getCopilotHistories(
        $workspaceId: String!
        $docId: String
        $options: QueryChatHistoriesInput
      ) {
        currentUser {
          copilot(workspaceId: $workspaceId) {
            histories(docId: $docId, options: $options) {
              sessionId
              tokens
              action
              createdAt
              messages {
                id
                role
                content
                attachments
                createdAt
              }
            }
          }
        }
      }
    `,
      variables,
    })
    .expect(200);

  handleGraphQLError(res);

  return res.body.data.currentUser?.copilot?.histories || [];
}

type Prompt = {
  name: string;
  model: string;
  messages: PromptMessage[];
  config?: PromptConfig;
};
type WorkflowTestCase = {
  graph: WorkflowGraph;
  prompts: Prompt[];
  callCount: number[];
  input: string[];
  params: WorkflowParams[];
  result: (string | undefined)[];
};

export const WorkflowTestCases: WorkflowTestCase[] = [
  {
    prompts: [
      {
        name: 'test1',
        model: 'test',
        messages: [{ role: 'user', content: '{{content}}' }],
      },
    ],
    graph: {
      name: 'test chat text node',
      graph: [
        {
          id: 'start',
          name: 'test chat text node',
          nodeType: WorkflowNodeType.Basic,
          type: NodeExecutorType.ChatText,
          promptName: 'test1',
          edges: [],
        },
      ],
    },
    callCount: [1],
    input: ['test'],
    params: [],
    result: ['generate text to text stream'],
  },
  {
    prompts: [],
    graph: {
      name: 'test check json node',
      graph: [
        {
          id: 'start',
          name: 'basic node',
          nodeType: WorkflowNodeType.Basic,
          type: NodeExecutorType.CheckJson,
          edges: [],
        },
      ],
    },
    callCount: [1, 1],
    input: ['{"test": "true"}', '{"test": '],
    params: [],
    result: ['true', 'false'],
  },
  {
    prompts: [],
    graph: {
      name: 'test check html node',
      graph: [
        {
          id: 'start',
          name: 'basic node',
          nodeType: WorkflowNodeType.Basic,
          type: NodeExecutorType.CheckHtml,
          edges: [],
        },
      ],
    },
    callCount: [1, 1, 1, 1],
    params: [{}, { strict: 'true' }, {}, {}],
    input: [
      '<html><span /></html>',
      '<html><span /></html>',
      '<img src="http://123.com/1.jpg" />',
      '{"test": "true"}',
    ],
    result: ['true', 'false', 'true', 'false'],
  },
  {
    prompts: [],
    graph: {
      name: 'test nope node',
      graph: [
        {
          id: 'start',
          name: 'nope node',
          nodeType: WorkflowNodeType.Nope,
          edges: [],
        },
      ],
    },
    callCount: [1],
    input: ['test'],
    params: [],
    result: ['test'],
  },
];
