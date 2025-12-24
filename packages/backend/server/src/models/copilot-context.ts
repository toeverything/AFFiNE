import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { CopilotSessionNotFound } from '../base';
import { BaseModel } from './base';
import {
  clearEmbeddingContent,
  ContextBlob,
  ContextConfigSchema,
  ContextDoc,
  ContextEmbedStatus,
  CopilotContext,
  DocChunkSimilarity,
  Embedding,
  EMBEDDING_DIMENSIONS,
  FileChunkSimilarity,
  MinimalContextConfigSchema,
} from './common/copilot';

type UpdateCopilotContextInput = Pick<CopilotContext, 'config'>;

/**
 * Copilot Job Model
 */
@Injectable()
export class CopilotContextModel extends BaseModel {
  // ================ contexts ================

  async create(sessionId: string) {
    const session = await this.db.aiSession.findFirst({
      where: { id: sessionId },
      select: { workspaceId: true },
    });
    if (!session) {
      throw new CopilotSessionNotFound();
    }

    const row = await this.db.aiContext.create({
      data: {
        sessionId,
        config: {
          workspaceId: session.workspaceId,
          blobs: [],
          docs: [],
          files: [],
          categories: [],
        },
      },
    });
    return row;
  }

  async get(id: string) {
    const row = await this.db.aiContext.findFirst({
      where: { id },
    });
    return row;
  }

  async getConfig(id: string) {
    const row = await this.get(id);
    if (row) {
      const config = ContextConfigSchema.safeParse(row.config);
      if (config.success) {
        return config.data;
      }
      const minimalConfig = MinimalContextConfigSchema.safeParse(row.config);
      if (minimalConfig.success) {
        // fulfill the missing fields
        return {
          blobs: [],
          docs: [],
          files: [],
          categories: [],
          ...minimalConfig.data,
        };
      }
    }
    return null;
  }

  async getBySessionId(sessionId: string) {
    const row = await this.db.aiContext.findFirst({
      where: { sessionId },
    });
    return row;
  }

  async mergeBlobStatus(
    workspaceId: string,
    blobs: ContextBlob[]
  ): Promise<ContextBlob[]> {
    const canEmbedding = await this.checkEmbeddingAvailable();
    const finishedBlobs = canEmbedding
      ? await this.listWorkspaceBlobEmbedding(
          workspaceId,
          Array.from(new Set(blobs.map(blob => blob.id)))
        )
      : [];
    const finishedBlobSet = new Set(finishedBlobs);

    for (const blob of blobs) {
      const status = finishedBlobSet.has(blob.id)
        ? ContextEmbedStatus.finished
        : undefined;
      // NOTE: when the blob has not been synchronized to the server or is in the embedding queue
      // the status will be empty, fallback to processing if no status is provided
      blob.status = status || blob.status || ContextEmbedStatus.processing;
    }

    return blobs;
  }

  async mergeDocStatus(workspaceId: string, docs: ContextDoc[]) {
    const canEmbedding = await this.checkEmbeddingAvailable();
    const finishedDoc = canEmbedding
      ? await this.listWorkspaceDocEmbedding(
          workspaceId,
          Array.from(new Set(docs.map(doc => doc.id)))
        )
      : [];
    const finishedDocSet = new Set(finishedDoc);

    for (const doc of docs) {
      const status = finishedDocSet.has(doc.id)
        ? ContextEmbedStatus.finished
        : undefined;
      // NOTE: when the document has not been synchronized to the server or is in the embedding queue
      // the status will be empty, fallback to processing if no status is provided
      doc.status = status || doc.status || ContextEmbedStatus.processing;
    }

    return docs;
  }

  async update(contextId: string, data: UpdateCopilotContextInput) {
    const ret = await this.db.aiContext.updateMany({
      where: {
        id: contextId,
      },
      data: {
        config: data.config || undefined,
      },
    });
    return ret.count > 0;
  }

  // ================ embeddings ================

  async checkEmbeddingAvailable(): Promise<boolean> {
    const [{ count }] = await this.db.$queryRaw<
      { count: number }[]
    >`SELECT count(1) FROM pg_tables WHERE tablename in ('ai_context_embeddings', 'ai_workspace_embeddings')`;
    return Number(count) === 2;
  }

  async listWorkspaceBlobEmbedding(
    workspaceId: string,
    blobIds?: string[]
  ): Promise<string[]> {
    const existsIds = await this.db.aiWorkspaceBlobEmbedding
      .groupBy({
        where: {
          workspaceId,
          blobId: blobIds ? { in: blobIds } : undefined,
        },
        by: ['blobId'],
      })
      .then(r => r.map(r => r.blobId));
    return existsIds;
  }

  async listWorkspaceDocEmbedding(workspaceId: string, docIds?: string[]) {
    const existsIds = await this.db.aiWorkspaceEmbedding
      .groupBy({
        where: {
          workspaceId,
          docId: docIds ? { in: docIds } : undefined,
        },
        by: ['docId'],
      })
      .then(r => r.map(r => r.docId));
    return existsIds;
  }

  private processEmbeddings(
    contextOrWorkspaceId: string,
    fileOrDocId: string,
    embeddings: Embedding[],
    withId = true
  ) {
    const groups = embeddings.map(e =>
      [
        withId ? randomUUID() : undefined,
        contextOrWorkspaceId,
        fileOrDocId,
        e.index,
        e.content,
        Prisma.raw(`'[${e.embedding.join(',')}]'`),
        new Date(),
      ].filter(v => v !== undefined)
    );
    return Prisma.join(groups.map(row => Prisma.sql`(${Prisma.join(row)})`));
  }

  async getFileContent(
    contextId: string,
    fileId: string,
    chunk?: number
  ): Promise<string | undefined> {
    const file = await this.db.aiContextEmbedding.findMany({
      where: { contextId, fileId, chunk },
      select: { content: true },
      orderBy: { chunk: 'asc' },
    });
    return file?.map(f => clearEmbeddingContent(f.content)).join('\n');
  }

  async insertFileEmbedding(
    contextId: string,
    fileId: string,
    embeddings: Embedding[]
  ) {
    if (embeddings.length === 0) {
      this.logger.warn(
        `No embeddings provided for contextId: ${contextId}, fileId: ${fileId}. Skipping insertion.`
      );
      return;
    }

    const values = this.processEmbeddings(contextId, fileId, embeddings);

    await this.db.$executeRaw`
    INSERT INTO "ai_context_embeddings"
    ("id", "context_id", "file_id", "chunk", "content", "embedding", "updated_at") VALUES ${values}
    ON CONFLICT (context_id, file_id, chunk) DO UPDATE SET
    content = EXCLUDED.content, embedding = EXCLUDED.embedding, updated_at = excluded.updated_at;
  `;
  }

  async deleteFileEmbedding(contextId: string, fileId: string) {
    await this.db.aiContextEmbedding.deleteMany({
      where: { contextId, fileId },
    });
  }

  async matchFileEmbedding(
    embedding: number[],
    contextId: string,
    topK: number,
    threshold: number
  ): Promise<Omit<FileChunkSimilarity, 'blobId' | 'name' | 'mimeType'>[]> {
    const similarityChunks = await this.db.$queryRaw<
      Array<Omit<FileChunkSimilarity, 'blobId' | 'name' | 'mimeType'>>
    >`
      SELECT "file_id" as "fileId", "chunk", "content", "embedding" <=> ${embedding}::vector as "distance" 
      FROM "ai_context_embeddings"
      WHERE context_id = ${contextId}
      ORDER BY "distance" ASC
      LIMIT ${topK};
    `;
    return similarityChunks.filter(c => Number(c.distance) <= threshold);
  }

  async getWorkspaceContent(
    workspaceId: string,
    docId: string,
    chunk?: number
  ): Promise<string | undefined> {
    const file = await this.db.aiWorkspaceEmbedding.findMany({
      where: { workspaceId, docId, chunk },
      select: { content: true },
      orderBy: { chunk: 'asc' },
    });
    return file?.map(f => clearEmbeddingContent(f.content)).join('\n');
  }

  async insertWorkspaceEmbedding(
    workspaceId: string,
    docId: string,
    embeddings: Embedding[]
  ) {
    if (embeddings.length === 0) {
      this.logger.warn(
        `No embeddings provided for workspaceId: ${workspaceId}, docId: ${docId}. Skipping insertion.`
      );
      return;
    }

    const values = this.processEmbeddings(
      workspaceId,
      docId,
      embeddings,
      false
    );
    await this.db.$executeRaw`
      INSERT INTO "ai_workspace_embeddings"
        ("workspace_id", "doc_id", "chunk", "content", "embedding", "updated_at")
      VALUES ${values}
      ON CONFLICT (workspace_id, doc_id, chunk)
      DO UPDATE SET
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        updated_at = excluded.updated_at;
    `;
  }

  async fulfillEmptyEmbedding(workspaceId: string, docId: string) {
    const emptyEmbedding = {
      index: 0,
      content: '',
      embedding: Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0),
    };
    await this.models.copilotContext.insertWorkspaceEmbedding(
      workspaceId,
      docId,
      [emptyEmbedding]
    );
  }

  async deleteWorkspaceEmbedding(workspaceId: string, docId: string) {
    await this.db.aiWorkspaceEmbedding.deleteMany({
      where: { workspaceId, docId },
    });
    await this.fulfillEmptyEmbedding(workspaceId, docId);
  }

  async matchWorkspaceEmbedding(
    embedding: number[],
    workspaceId: string,
    topK: number,
    threshold: number,
    matchDocIds?: string[]
  ): Promise<DocChunkSimilarity[]> {
    const similarityChunks = await this.db.$queryRaw<Array<DocChunkSimilarity>>`
      SELECT
        w."doc_id" as "docId",
        w."chunk",
        w."content",
        w."embedding" <=> ${embedding}::vector as "distance"
      FROM "ai_workspace_embeddings" w
      LEFT JOIN "ai_workspace_ignored_docs" i
        ON i."workspace_id" = w."workspace_id"
          AND i."doc_id" = w."doc_id"
          ${matchDocIds?.length ? Prisma.sql`AND w."doc_id" NOT IN (${Prisma.join(matchDocIds)})` : Prisma.empty}
      WHERE
        w."workspace_id" = ${workspaceId}
        AND i."doc_id" IS NULL
        AND (w."embedding" <=> ${embedding}::vector) <= ${threshold}
      ORDER BY "distance" ASC
      LIMIT ${topK};
    `;

    return similarityChunks;
  }
}
