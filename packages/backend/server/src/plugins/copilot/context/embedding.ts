import OpenAI from 'openai';

import { Embedding, EmbeddingClient } from './types';

export class OpenAIEmbeddingClient extends EmbeddingClient {
  constructor(private readonly client: OpenAI) {
    super();
  }

  async getEmbeddings(
    input: string[],
    signal?: AbortSignal
  ): Promise<Embedding[]> {
    const resp = await this.client.embeddings.create(
      {
        input,
        model: 'text-embedding-3-large',
        encoding_format: 'float',
      },
      { signal }
    );
    return resp.data.map(e => ({ ...e, content: input[e.index] }));
  }
}

export class MockEmbeddingClient extends EmbeddingClient {
  async getEmbeddings(input: string[]): Promise<Embedding[]> {
    return input.map((_, i) => ({
      index: i,
      content: input[i],
      embedding: Array.from({ length: 512 }, () => Math.random()),
    }));
  }
}
