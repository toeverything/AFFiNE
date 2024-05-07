import { randomBytes } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  DEFAULT_DIMENSIONS,
  OpenAIProvider,
} from '../../src/plugins/copilot/providers/openai';
import {
  CopilotCapability,
  CopilotImageToImageProvider,
  CopilotImageToTextProvider,
  CopilotProviderType,
  CopilotTextToEmbeddingProvider,
  CopilotTextToImageProvider,
  CopilotTextToTextProvider,
  PromptMessage,
} from '../../src/plugins/copilot/types';
import { gql } from './common';
import { handleGraphQLError } from './utils';

export class MockCopilotTestProvider
  extends OpenAIProvider
  implements
    CopilotTextToTextProvider,
    CopilotTextToEmbeddingProvider,
    CopilotTextToImageProvider,
    CopilotImageToImageProvider,
    CopilotImageToTextProvider
{
  override readonly availableModels = ['test'];
  static override readonly capabilities = [
    CopilotCapability.TextToText,
    CopilotCapability.TextToEmbedding,
    CopilotCapability.TextToImage,
    CopilotCapability.ImageToImage,
    CopilotCapability.ImageToText,
  ];

  override get type(): CopilotProviderType {
    return CopilotProviderType.Test;
  }

  override getCapabilities(): CopilotCapability[] {
    return MockCopilotTestProvider.capabilities;
  }

  override isModelAvailable(model: string): boolean {
    return this.availableModels.includes(model);
  }

  // ====== text to text ======

  override async generateText(
    messages: PromptMessage[],
    model: string = 'test',
    _options: {
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
      user?: string;
    } = {}
  ): Promise<string> {
    this.checkParams({ messages, model });
    return 'generate text to text';
  }

  override async *generateTextStream(
    messages: PromptMessage[],
    model: string = 'gpt-3.5-turbo',
    options: {
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
      user?: string;
    } = {}
  ): AsyncIterable<string> {
    this.checkParams({ messages, model });

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
    options: {
      dimensions: number;
      signal?: AbortSignal;
      user?: string;
    } = { dimensions: DEFAULT_DIMENSIONS }
  ): Promise<number[][]> {
    messages = Array.isArray(messages) ? messages : [messages];
    this.checkParams({ embeddings: messages, model });

    return [Array.from(randomBytes(options.dimensions)).map(v => v % 128)];
  }

  // ====== text to image ======
  override async generateImages(
    messages: PromptMessage[],
    _model: string = 'test',
    _options: {
      signal?: AbortSignal;
      user?: string;
    } = {}
  ): Promise<Array<string>> {
    const { content: prompt } = messages.pop() || {};
    if (!prompt) {
      throw new Error('Prompt is required');
    }

    return ['https://example.com/image.jpg'];
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
  messageId: string,
  prefix = ''
): Promise<string> {
  const res = await request(app.getHttpServer())
    .get(`/api/copilot/chat/${sessionId}${prefix}?messageId=${messageId}`)
    .auth(userToken, { type: 'bearer' })
    .expect(200);

  return res.text;
}

export async function chatWithTextStream(
  app: INestApplication,
  userToken: string,
  sessionId: string,
  messageId: string
) {
  return chatWithText(app, userToken, sessionId, messageId, '/stream');
}

export async function chatWithImages(
  app: INestApplication,
  userToken: string,
  sessionId: string,
  messageId: string
) {
  return chatWithText(app, userToken, sessionId, messageId, '/images');
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
      sessionId?: string;
      action?: boolean;
      limit?: number;
      skip?: number;
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
