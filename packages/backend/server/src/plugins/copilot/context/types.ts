import { File } from 'node:buffer';

import { CopilotContextFileNotSupported, OneMB } from '../../../base';
import { Embedding } from '../../../models';
import { parseDoc } from '../../../native';

declare global {
  interface Events {
    'workspace.doc.embedding': Array<{
      workspaceId: string;
      docId: string;
    }>;
    'workspace.file.embed.finished': {
      contextId: string;
      fileId: string;
      chunkSize: number;
    };
    'workspace.file.embed.failed': {
      contextId: string;
      fileId: string;
      error: string;
    };
  }
}

export const MAX_EMBEDDABLE_SIZE = 50 * OneMB;

export type Chunk = {
  index: number;
  content: string;
};

export abstract class EmbeddingClient {
  async getFileEmbeddings(
    file: File,
    signal?: AbortSignal
  ): Promise<Embedding[][]> {
    const chunks = await this.getFileChunks(file, signal);
    const chunkedEmbeddings = await Promise.all(
      chunks.map(chunk => this.generateEmbeddings(chunk))
    );
    return chunkedEmbeddings;
  }

  async getFileChunks(file: File, signal?: AbortSignal): Promise<Chunk[][]> {
    const buffer = Buffer.from(await file.arrayBuffer());
    let doc;
    try {
      doc = await parseDoc(file.name, buffer);
    } catch (e: any) {
      throw new CopilotContextFileNotSupported({
        fileName: file.name,
        message: e?.message || e?.toString?.() || 'format not supported',
      });
    }
    if (doc && !signal?.aborted) {
      if (!doc.chunks.length) {
        throw new CopilotContextFileNotSupported({
          fileName: file.name,
          message: 'no content found',
        });
      }
      const input = doc.chunks.toSorted((a, b) => a.index - b.index);
      // chunk input into 128 every array
      const chunks: Chunk[][] = [];
      for (let i = 0; i < input.length; i += 128) {
        chunks.push(input.slice(i, i + 128));
      }
      return chunks;
    }
    throw new CopilotContextFileNotSupported({
      fileName: file.name,
      message: 'failed to parse file',
    });
  }

  async generateEmbeddings(chunks: Chunk[]): Promise<Embedding[]> {
    const retry = 3;

    let embeddings: Embedding[] = [];
    let error = null;
    for (let i = 0; i < retry; i++) {
      try {
        embeddings = await this.getEmbeddings(chunks.map(c => c.content));
        break;
      } catch (e) {
        error = e;
      }
    }
    if (error) throw error;

    // fix the index of the embeddings
    return embeddings.map(e => ({ ...e, index: chunks[e.index].index }));
  }

  abstract getEmbeddings(
    input: string[],
    signal?: AbortSignal
  ): Promise<Embedding[]>;
}
