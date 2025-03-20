import { Readable } from 'node:stream';

import { PrismaClient } from '@prisma/client';

import { readBufferWithLimit } from '../../../base';
import { MAX_EMBEDDABLE_SIZE } from './types';

export class GqlSignal implements AsyncDisposable {
  readonly abortController = new AbortController();

  get signal() {
    return this.abortController.signal;
  }

  async [Symbol.asyncDispose]() {
    this.abortController.abort();
  }
}

export async function checkEmbeddingAvailable(
  db: PrismaClient
): Promise<boolean> {
  const [{ count }] = await db.$queryRaw<
    {
      count: number;
    }[]
  >`SELECT count(1) FROM pg_tables WHERE tablename in ('ai_context_embeddings', 'ai_workspace_embeddings')`;
  return Number(count) === 2;
}

export function readStream(
  readable: Readable,
  maxSize = MAX_EMBEDDABLE_SIZE
): Promise<Buffer> {
  return readBufferWithLimit(readable, maxSize);
}
