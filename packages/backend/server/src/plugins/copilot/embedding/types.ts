import { File } from 'node:buffer';

import { z } from 'zod';

import { CopilotContextFileNotSupported } from '../../../base';
import type { PageDocContent } from '../../../core/utils/blocksuite';
import { ChunkSimilarity, Embedding } from '../../../models';
import { parseDoc } from '../../../native';

declare global {
  interface Events {
    'workspace.embedding': {
      workspaceId: string;
      enableDocEmbedding?: boolean;
    };

    'workspace.blob.embed.finished': {
      contextId: string;
      blobId: string;
      chunkSize: number;
    };

    'workspace.blob.embed.failed': {
      contextId: string;
      blobId: string;
      error: string;
    };

    'workspace.doc.embedding': Array<{
      workspaceId: string;
      docId: string;
    }>;

    'workspace.doc.embed.failed': {
      contextId: string;
      docId: string;
    };

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
  interface Jobs {
    'copilot.embedding.docs': {
      contextId?: string;
      workspaceId: string;
      docId: string;
    };

    'copilot.embedding.updateDoc': {
      workspaceId: string;
      docId: string;
    };

    'copilot.embedding.deleteDoc': {
      workspaceId: string;
      docId: string;
    };

    'copilot.embedding.files': {
      contextId?: string;
      userId: string;
      workspaceId: string;
      blobId: string;
      fileId: string;
      fileName: string;
    };

    'copilot.embedding.blobs': {
      contextId?: string;
      workspaceId: string;
      blobId: string;
    };

    'copilot.embedding.cleanupTrashedDocEmbeddings': {
      workspaceId: string;
    };
  }
}

export type DocFragment = PageDocContent & {
  createdAt: string;
  createdBy?: string;
  updatedAt: string;
  updatedBy?: string;
};

export type Chunk = {
  index: number;
  content: string;
};

export abstract class EmbeddingClient {
  async configured() {
    return true;
  }

  async getFileEmbeddings(
    file: File,
    chunkMapper: (chunk: Chunk[]) => Chunk[],
    signal?: AbortSignal
  ): Promise<Embedding[][]> {
    const chunks = await this.getFileChunks(file, signal);
    const chunkedEmbeddings = await Promise.all(
      chunks.map(chunk => this.generateEmbeddings(chunkMapper(chunk)))
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

  async generateEmbeddings(
    chunks: Chunk[],
    signal?: AbortSignal
  ): Promise<Embedding[]> {
    const retry = 3;

    let embeddings: Embedding[] = [];
    let error = null;
    for (let i = 0; i < retry; i++) {
      try {
        embeddings = await this.getEmbeddings(
          chunks.map(c => c.content),
          signal
        );
        break;
      } catch (e) {
        error = e;
      }
    }
    if (error) throw error;

    // fix the index of the embeddings
    return embeddings.map(e => ({ ...e, index: chunks[e.index].index }));
  }

  async reRank<Chunk extends ChunkSimilarity = ChunkSimilarity>(
    _query: string,
    embeddings: Chunk[],
    topK: number,
    _signal?: AbortSignal
  ): Promise<Chunk[]> {
    // sort by distance with ascending order
    return embeddings
      .toSorted((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
      .slice(0, topK);
  }

  async getEmbedding(query: string, signal?: AbortSignal) {
    const embedding = await this.getEmbeddings([query], signal);
    return embedding?.[0]?.embedding;
  }

  abstract getEmbeddings(
    input: string[],
    signal?: AbortSignal
  ): Promise<Embedding[]>;
}

const ReRankItemSchema = z.object({
  chunk: z.number().describe('The chunk index of the search result.'),
  targetId: z.string().describe('The id of the target.'),
  score: z
    .number()
    .min(0)
    .max(10)
    .describe(
      'The relevance score of the results should be 0-10, with 0 being the least relevant and 10 being the most relevant.'
    ),
});

export type ReRankResult = z.infer<typeof ReRankItemSchema>[];
