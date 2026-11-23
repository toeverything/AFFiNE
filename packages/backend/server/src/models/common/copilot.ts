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

// Fallback for requests without explicit dimensions (test mock). Mirrors the
// native embedding storage-space contract: AFFINE_EMBEDDING_SPACE_DIMENSIONS,
// default 1024.
function parseEmbeddingDimensions(): number {
  const parsed = Number.parseInt(
    process.env.AFFINE_EMBEDDING_SPACE_DIMENSIONS ?? '',
    10
  );
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 4000
    ? parsed
    : 1024;
}

export const EMBEDDING_DIMENSIONS = parseEmbeddingDimensions();

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
