import {
  createOpenAI,
  type OpenAIProvider as VercelOpenAIProvider,
} from '@ai-sdk/openai';
import { embedMany } from 'ai';

import { Embedding } from '../../../models';
import { OpenAIConfig } from '../providers/openai';
import { EmbeddingClient } from './types';

export class OpenAIEmbeddingClient extends EmbeddingClient {
  readonly #instance: VercelOpenAIProvider;

  constructor(config: OpenAIConfig) {
    super();
    this.#instance = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  async getEmbeddings(input: string[]): Promise<Embedding[]> {
    const modelInstance = this.#instance.embedding('text-embedding-3-large', {
      dimensions: 1024,
    });

    const { embeddings } = await embedMany({
      model: modelInstance,
      values: input,
    });

    return Array.from(embeddings.entries()).map(([index, embedding]) => ({
      index,
      embedding,
      content: input[index],
    }));
  }
}

export class MockEmbeddingClient extends EmbeddingClient {
  async getEmbeddings(input: string[]): Promise<Embedding[]> {
    return input.map((_, i) => ({
      index: i,
      content: input[i],
      embedding: Array.from({ length: 1024 }, () => Math.random()),
    }));
  }
}
