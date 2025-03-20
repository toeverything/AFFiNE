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

export const ContextDocSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
});

export const ContextFileSchema = z.object({
  id: z.string(),
  chunkSize: z.number(),
  name: z.string(),
  status: z.enum([
    ContextEmbedStatus.processing,
    ContextEmbedStatus.finished,
    ContextEmbedStatus.failed,
  ]),
  error: z.string().nullable(),
  blobId: z.string(),
  createdAt: z.number(),
});

export const ContextCategorySchema = z.object({
  id: z.string(),
  type: z.enum([ContextCategories.Tag, ContextCategories.Collection]),
  docs: ContextDocSchema.array(),
  createdAt: z.number(),
});

export const ContextConfigSchema = z.object({
  workspaceId: z.string(),
  files: ContextFileSchema.array(),
  docs: ContextDocSchema.array(),
  categories: ContextCategorySchema.array(),
});

export const MinimalContextConfigSchema = ContextConfigSchema.pick({
  workspaceId: true,
});

export type ContextCategory = z.infer<typeof ContextCategorySchema>;
export type ContextDoc = z.infer<typeof ContextDocSchema>;
export type ContextFile = z.infer<typeof ContextFileSchema>;
export type ContextConfig = z.infer<typeof ContextConfigSchema>;
export type ContextListItem = ContextDoc | ContextFile;
export type ContextList = ContextListItem[];

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
};

export type DocChunkSimilarity = ChunkSimilarity & {
  docId: string;
};
