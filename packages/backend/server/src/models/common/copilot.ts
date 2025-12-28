import { AiJobStatus, AiJobType } from '@prisma/client';
import type { JsonValue } from '@prisma/client/runtime/library';
import { z } from 'zod';

export interface CopilotJob {
  id?: string;
  workspaceId: string;
  blobId: string;
  createdBy?: string;
  type: AiJobType;
  status?: AiJobStatus;
  payload?: JsonValue;
}

export interface CopilotContext {
  id?: string;
  sessionId: string;
  config: JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

export enum ContextEmbedStatus {
  processing = 'processing',
  finished = 'finished',
  failed = 'failed',
}

export enum ContextCategories {
  Tag = 'tag',
  Collection = 'collection',
}

const ContextEmbedStatusSchema = z.enum([
  ContextEmbedStatus.processing,
  ContextEmbedStatus.finished,
  ContextEmbedStatus.failed,
]);

const ContextBlobSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
});

const ContextDocSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
});

export const ContextFileSchema = z.object({
  id: z.string(),
  chunkSize: z.number(),
  name: z.string(),
  mimeType: z.string().optional(),
  status: ContextEmbedStatusSchema,
  error: z.string().nullable(),
  blobId: z.string(),
  createdAt: z.number(),
});

export const ContextCategorySchema = z.object({
  id: z.string(),
  type: z.enum([ContextCategories.Tag, ContextCategories.Collection]),
  docs: ContextDocSchema.merge(
    z.object({ status: ContextEmbedStatusSchema })
  ).array(),
  createdAt: z.number(),
});

export const ContextConfigSchema = z.object({
  workspaceId: z.string(),
  blobs: ContextBlobSchema.merge(
    z.object({ status: ContextEmbedStatusSchema.optional() })
  ).array(),
  files: ContextFileSchema.array(),
  docs: ContextDocSchema.merge(
    z.object({ status: ContextEmbedStatusSchema.optional() })
  ).array(),
  categories: ContextCategorySchema.array(),
});

export const MinimalContextConfigSchema = ContextConfigSchema.pick({
  workspaceId: true,
});

export type ContextCategory = z.infer<typeof ContextCategorySchema>;
export type ContextConfig = z.infer<typeof ContextConfigSchema>;
export type ContextBlob = z.infer<typeof ContextConfigSchema>['blobs'][number];
export type ContextDoc = z.infer<typeof ContextConfigSchema>['docs'][number];
export type ContextFile = z.infer<typeof ContextConfigSchema>['files'][number];

// embeddings

export type Embedding = {
  /**
   * The index of the embedding in the list of embeddings.
   */
  index: number;
  content: string;
  embedding: Array<number>;
};

export type ChunkSimilarity = {
  chunk: number;
  content: string;
  distance: number | null;
};

export type FileChunkSimilarity = ChunkSimilarity & {
  fileId: string;
  blobId: string;
  name: string;
  mimeType: string;
};

export type BlobChunkSimilarity = ChunkSimilarity & {
  blobId: string;
};

export type DocChunkSimilarity = ChunkSimilarity & {
  docId: string;
};

export const CopilotWorkspaceFileSchema = z.object({
  fileName: z.string(),
  blobId: z.string(),
  mimeType: z.string(),
  size: z.number(),
});

export type CopilotWorkspaceFileMetadata = z.infer<
  typeof CopilotWorkspaceFileSchema
>;
export type CopilotWorkspaceFile = CopilotWorkspaceFileMetadata & {
  workspaceId: string;
  fileId: string;
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
