import { AiJobStatus, AiJobType } from '@prisma/client';
import type { JsonValue } from '@prisma/client/runtime/library';

export interface CopilotJob {
  id?: string;
  workspaceId: string;
  blobId: string;
  createdBy?: string;
  type: AiJobType;
  status?: AiJobStatus;
  payload?: JsonValue;
}

// embeddings

export type Embedding = {
  /**
   * The index of the embedding in the list of embeddings.
   */
  index: number;
  content: string;
  embedding: Array<number>;
};

export type DocumentEmbedding = Embedding & {
  projectionVersion: number;
  sourceHash: string;
  unitId: string;
  visibility: 'page' | 'edgeless' | 'both';
  blockId?: string;
  elementId?: string;
  frameId?: string;
};

export type ChunkSimilarity = {
  chunk: number;
  content: string;
  distance: number | null;
};

export type DocChunkSimilarity = ChunkSimilarity & {
  docId: string;
  unitId: string;
  visibility: 'page' | 'edgeless' | 'both';
  blockId?: string;
  elementId?: string;
  frameId?: string;
};

export type CopilotWorkspaceArtifact = {
  workspaceId: string;
  artifactId: string;
  contentHash: string;
  fileName: string;
  embeddingStatus: 'processing' | 'ready' | 'failed';
  mediaType: string;
  size: number;
  createdAt: Date;
};

export type IgnoredDoc = {
  docId: string;
  createdAt: Date;
  // metadata
  docCreatedAt: Date | undefined;
  docUpdatedAt: Date | undefined;
  title: string | undefined;
  createdBy: string | undefined;
  createdByAvatar: string | undefined;
  updatedBy: string | undefined;
};

export const EMBEDDING_DIMENSIONS = 1024;

const FILTER_PREFIX = [
  'Title: ',
  'Created at: ',
  'Updated at: ',
  'Created by: ',
  'Updated by: ',
];

export function clearEmbeddingContent(content: string): string {
  const lines = content.split('\n');
  let maxLines = 5;
  while (maxLines > 0 && lines.length > 0) {
    if (FILTER_PREFIX.some(prefix => lines[0].startsWith(prefix))) {
      lines.shift();
      maxLines--;
    } else {
      // only process consecutive metadata rows
      break;
    }
  }
  return lines.join('\n');
}

export function clearEmbeddingChunk(chunk: ChunkSimilarity): ChunkSimilarity {
  if (chunk.content) {
    const content = clearEmbeddingContent(chunk.content);
    return { ...chunk, content };
  }
  return chunk;
}
