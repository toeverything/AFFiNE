import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { Prisma, PrismaClient } from '@prisma/client';

import { PaginationInput } from '../base';
import { BaseModel } from './base';
import {
  type BlobChunkSimilarity,
  clearEmbeddingContent,
  type CopilotWorkspaceFile,
  type CopilotWorkspaceFileMetadata,
  type Embedding,
  type FileChunkSimilarity,
  type IgnoredDoc,
} from './common';

@Injectable()
export class CopilotWorkspaceConfigModel extends BaseModel {
  constructor(private readonly database: PrismaClient) {
    super();
  }

  @Transactional()
  private async listIgnoredDocIds(
    workspaceId: string,
    options?: PaginationInput
  ) {
    return await this.db.aiWorkspaceIgnoredDocs.findMany({
      where: {
        workspaceId,
      },
      select: {
        docId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: options?.offset,
      take: options?.first,
    });
  }

  /**
   * find docs to embed, excluding ignored and already embedded docs
   * newer docs will be list first
   * @param workspaceId id of the workspace
   * @returns docIds
   */
  async findDocsToEmbed(workspaceId: string): Promise<string[]> {
    // NOTE: for unknown reason, the transaction will timeout if call from event handler
    // so we use an independent client here
    const docIds = await this.database.$queryRaw<{ id: string }[]>`
      SELECT s.guid as id
        FROM snapshots AS s
          LEFT JOIN ai_workspace_embeddings e
            ON e.workspace_id = s.workspace_id
               AND e.doc_id = s.guid
          LEFT JOIN ai_workspace_ignored_docs id
            ON id.workspace_id = s.workspace_id
               AND id.doc_id = s.guid
        WHERE s.workspace_id = ${workspaceId}
          AND s.guid <> s.workspace_id
          AND s.guid NOT LIKE '%$%'
          AND s.guid NOT LIKE '%:settings:%'
          AND e.doc_id IS NULL
          AND id.doc_id IS NULL
          AND s.blob <> E'\\\\x0000';`;

    return docIds.map(r => r.id);
  }

  @Transactional()
  async updateIgnoredDocs(
    workspaceId: string,
    add: string[] = [],
    remove: string[] = []
  ) {
    const removed = new Set(remove);
    const ignored = await this.listIgnoredDocIds(workspaceId).then(
      r => new Set(r.map(r => r.docId).filter(id => !removed.has(id)))
    );
    const added = add.filter(id => !ignored.has(id));

    const { count: addedCount } =
      await this.db.aiWorkspaceIgnoredDocs.createMany({
        data: added.map(docId => ({
          workspaceId,
          docId,
        })),
      });

    const { count: removedCount } =
      await this.db.aiWorkspaceIgnoredDocs.deleteMany({
        where: {
          workspaceId,
          docId: {
            in: Array.from(removed),
          },
        },
      });

    return addedCount + removedCount;
  }

  @Transactional()
  async listIgnoredDocs(
    workspaceId: string,
    options?: PaginationInput
  ): Promise<IgnoredDoc[]> {
    const row = await this.listIgnoredDocIds(workspaceId, options);
    const ids = row.map(r => ({ workspaceId, docId: r.docId }));
    const docs = await this.models.doc.findMetas(ids);
    const docsMap = new Map(
      docs.filter(r => !!r).map(r => [`${r.workspaceId}-${r.docId}`, r])
    );
    const authors = await this.models.doc.findAuthors(ids);
    const authorsMap = new Map(
      authors.filter(r => !!r).map(r => [`${r.workspaceId}-${r.id}`, r])
    );

    return row.map(r => {
      const docMeta = docsMap.get(`${workspaceId}-${r.docId}`);
      const docAuthor = authorsMap.get(`${workspaceId}-${r.docId}`);
      return {
        ...r,
        docCreatedAt: docAuthor?.createdAt,
        docUpdatedAt: docAuthor?.updatedAt,
        title: docMeta?.title || undefined,
        createdBy: docAuthor?.createdByUser?.name,
        createdByAvatar: docAuthor?.createdByUser?.avatarUrl || undefined,
        updatedBy: docAuthor?.updatedByUser?.name,
      };
    });
  }

  @Transactional()
  async countIgnoredDocs(workspaceId: string): Promise<number> {
    const count = await this.db.aiWorkspaceIgnoredDocs.count({
      where: {
        workspaceId,
      },
    });
    return count;
  }

  @Transactional()
  async checkIgnoredDocs(workspaceId: string, docIds: string[]) {
    const ignored = await this.listIgnoredDocIds(workspaceId).then(
      r => new Set(r.map(r => r.docId))
    );

    return docIds.filter(id => ignored.has(id));
  }

  // check if a docId has only placeholder embeddings
  @Transactional()
  async hasPlaceholder(workspaceId: string, docId: string): Promise<boolean> {
    const [total, nonPlaceholder] = await Promise.all([
      this.db.aiWorkspaceEmbedding.count({ where: { workspaceId, docId } }),
      this.db.aiWorkspaceEmbedding.count({
        where: {
          workspaceId,
          docId,
          NOT: { AND: [{ chunk: 0 }, { content: '' }] },
        },
      }),
    ]);
    return total > 0 && nonPlaceholder === 0;
  }

  private getEmbeddableCondition(
    workspaceId: string,
    ignoredDocIds?: string[]
  ): Prisma.SnapshotWhereInput {
    const condition: Prisma.SnapshotWhereInput['AND'] = [
      { id: { not: workspaceId } },
      { id: { not: { contains: '$' } } },
      { id: { not: { contains: ':settings:' } } },
      { blob: { not: new Uint8Array([0, 0]) } },
    ];
    if (ignoredDocIds && ignoredDocIds.length > 0) {
      condition.push({ id: { notIn: ignoredDocIds } });
    }
    return { workspaceId, AND: condition };
  }

  async listEmbeddableDocIds(workspaceId: string) {
    const condition = this.getEmbeddableCondition(workspaceId);
    const rows = await this.db.snapshot.findMany({
      where: condition,
      select: { id: true },
    });
    return rows.map(r => r.id);
  }

  @Transactional()
  async getEmbeddingStatus(workspaceId: string) {
    const ignoredDocIds = (await this.listIgnoredDocIds(workspaceId)).map(
      d => d.docId
    );
    const snapshotCondition = this.getEmbeddableCondition(
      workspaceId,
      ignoredDocIds
    );

    const [docTotal, docEmbedded, fileTotal, fileEmbedded] = await Promise.all([
      this.db.snapshot.findMany({
        where: snapshotCondition,
        select: { id: true },
      }),
      this.db.snapshot.findMany({
        where: { ...snapshotCondition, embedding: { some: {} } },
        select: { id: true },
      }),
      this.db.aiWorkspaceFiles.count({ where: { workspaceId } }),
      this.db.aiWorkspaceFiles.count({
        where: { workspaceId, embeddings: { some: {} } },
      }),
    ]);

    const docTotalIds = docTotal.map(d => d.id);
    const docTotalSet = new Set(docTotalIds);
    const outdatedDocPrefix = `${workspaceId}:space:`;
    const duplicateOutdatedDocSet = new Set(
      docTotalIds
        .filter(id => id.startsWith(outdatedDocPrefix))
        .filter(id => docTotalSet.has(id.slice(outdatedDocPrefix.length)))
    );

    return {
      total:
        docTotalIds.filter(id => !duplicateOutdatedDocSet.has(id)).length +
        fileTotal,
      embedded:
        docEmbedded
          .map(d => d.id)
          .filter(id => !duplicateOutdatedDocSet.has(id)).length + fileEmbedded,
    };
  }

  @Transactional()
  async checkDocNeedEmbedded(workspaceId: string, docId: string) {
    // NOTE: check if the document needs re-embedding.
    // 1. first-time embedding when no embedding exists
    // 2. re-embedding only when the doc has updates newer than the last embedding
    //    AND the last embedding is older than 10 minutes (avoid frequent updates)
    const result = await this.db.$queryRaw<{ needs_embedding: boolean }[]>`
      SELECT
        EXISTS (
          WITH docs AS (
            SELECT
              s.workspace_id,
              s.guid AS doc_id,
              s.updated_at
            FROM
              snapshots s
            WHERE
              s.workspace_id = ${workspaceId}
              AND s.guid = ${docId}
            UNION
            ALL
            SELECT
              u.workspace_id,
              u.guid AS doc_id,
              u.created_at AS updated_at
            FROM
              "updates" u
            WHERE
              u.workspace_id = ${workspaceId}
              AND u.guid = ${docId}
          )
          SELECT
            1
          FROM
            docs
            LEFT JOIN ai_workspace_embeddings e
              ON e.workspace_id = docs.workspace_id
              AND e.doc_id = docs.doc_id
          WHERE
            e.updated_at IS NULL
            OR (docs.updated_at > e.updated_at AND e.updated_at < NOW() - INTERVAL '10 minutes')
        ) AS needs_embedding;
    `;

    return result[0]?.needs_embedding ?? false;
  }

  // ================ embeddings ================

  async checkEmbeddingAvailable(): Promise<boolean> {
    const [{ count }] = await this.db.$queryRaw<
      { count: number }[]
    >`SELECT count(1) FROM pg_tables WHERE tablename in ('ai_workspace_embeddings', 'ai_workspace_file_embeddings', 'ai_workspace_blob_embeddings')`;
    return Number(count) === 3;
  }

  private processEmbeddings(
    workspaceId: string,
    fileOrBlobId: string,
    embeddings: Embedding[]
  ) {
    const groups = embeddings.map(e =>
      [
        workspaceId,
        fileOrBlobId,
        e.index,
        e.content,
        Prisma.raw(`'[${e.embedding.join(',')}]'`),
      ].filter(v => v !== undefined)
    );
    return Prisma.join(groups.map(row => Prisma.sql`(${Prisma.join(row)})`));
  }

  async addFile(
    workspaceId: string,
    file: CopilotWorkspaceFileMetadata
  ): Promise<CopilotWorkspaceFile> {
    const fileId = randomUUID();
    const row = await this.db.aiWorkspaceFiles.create({
      data: { ...file, workspaceId, fileId },
    });

    return row;
  }

  async getFile(workspaceId: string, fileId: string) {
    const file = await this.db.aiWorkspaceFiles.findFirst({
      where: {
        workspaceId,
        fileId,
      },
    });
    return file;
  }

  @Transactional()
  async insertFileEmbeddings(
    workspaceId: string,
    fileId: string,
    embeddings: Embedding[]
  ) {
    if (embeddings.length === 0) {
      this.logger.warn(
        `No embeddings provided for workspaceId: ${workspaceId}, fileId: ${fileId}. Skipping insertion.`
      );
      return;
    }

    const values = this.processEmbeddings(workspaceId, fileId, embeddings);
    await this.db.$executeRaw`
          INSERT INTO "ai_workspace_file_embeddings"
          ("workspace_id", "file_id", "chunk", "content", "embedding") VALUES ${values}
          ON CONFLICT (workspace_id, file_id, chunk) DO NOTHING;
      `;
  }

  async listFiles(
    workspaceId: string,
    options?: {
      includeRead?: boolean;
    } & PaginationInput
  ): Promise<CopilotWorkspaceFile[]> {
    const files = await this.db.aiWorkspaceFiles.findMany({
      where: {
        workspaceId,
      },
      orderBy: { createdAt: 'desc' },
      skip: options?.offset,
      take: options?.first,
    });
    return files;
  }

  async countFiles(workspaceId: string): Promise<number> {
    const count = await this.db.aiWorkspaceFiles.count({
      where: {
        workspaceId,
      },
    });
    return count;
  }

  async matchFileEmbedding(
    workspaceId: string,
    embedding: number[],
    topK: number,
    threshold: number
  ): Promise<FileChunkSimilarity[]> {
    if (!(await this.allowEmbedding(workspaceId))) {
      return [];
    }

    const similarityChunks = await this.db.$queryRaw<
      Array<FileChunkSimilarity>
    >`
      SELECT
        e."file_id" as "fileId",
        f."file_name" as "name",
        f."blob_id" as "blobId",
        f."mime_type" as "mimeType",
        e."chunk",
        e."content",
        e."embedding" <=> ${embedding}::vector as "distance" 
      FROM "ai_workspace_file_embeddings" e
      JOIN "ai_workspace_files" f
        ON e."workspace_id" = f."workspace_id"
        AND e."file_id" = f."file_id"
      WHERE e.workspace_id = ${workspaceId}
      ORDER BY "distance" ASC
      LIMIT ${topK};
    `;
    return similarityChunks.filter(c => Number(c.distance) <= threshold);
  }

  async getBlobContent(
    workspaceId: string,
    blobId: string,
    chunk?: number
  ): Promise<string | undefined> {
    const blob = await this.db.aiWorkspaceBlobEmbedding.findMany({
      where: { workspaceId, blobId, chunk },
      select: { content: true },
      orderBy: { chunk: 'asc' },
    });
    return blob?.map(f => clearEmbeddingContent(f.content)).join('\n');
  }

  async getBlobChunkSizes(workspaceId: string, blobIds: string[]) {
    const sizes = await this.db.aiWorkspaceBlobEmbedding.groupBy({
      by: ['blobId'],
      _count: { chunk: true },
      where: { workspaceId, blobId: { in: blobIds } },
    });
    return sizes.reduce((acc, cur) => {
      if (cur._count.chunk) {
        acc.set(cur.blobId, cur._count.chunk);
      }
      return acc;
    }, new Map<string, number>());
  }

  @Transactional()
  async insertBlobEmbeddings(
    workspaceId: string,
    blobId: string,
    embeddings: Embedding[]
  ) {
    if (embeddings.length === 0) {
      this.logger.warn(
        `No embeddings provided for workspaceId: ${workspaceId}, blobId: ${blobId}. Skipping insertion.`
      );
      return;
    }

    const values = this.processEmbeddings(workspaceId, blobId, embeddings);
    await this.db.$executeRaw`
          INSERT INTO "ai_workspace_blob_embeddings"
          ("workspace_id", "blob_id", "chunk", "content", "embedding") VALUES ${values}
          ON CONFLICT (workspace_id, blob_id, chunk) DO NOTHING;
      `;
  }

  async matchBlobEmbedding(
    workspaceId: string,
    embedding: number[],
    topK: number,
    threshold: number
  ): Promise<BlobChunkSimilarity[]> {
    if (!(await this.allowEmbedding(workspaceId))) {
      return [];
    }

    const similarityChunks = await this.db.$queryRaw<
      Array<BlobChunkSimilarity>
    >`
      SELECT
        e."blob_id" as "blobId",
        e."chunk",
        e."content",
        e."embedding" <=> ${embedding}::vector as "distance" 
      FROM "ai_workspace_blob_embeddings" e
      WHERE e.workspace_id = ${workspaceId}
      ORDER BY "distance" ASC
      LIMIT ${topK};
    `;
    return similarityChunks.filter(c => Number(c.distance) <= threshold);
  }

  async removeBlob(workspaceId: string, blobId: string) {
    await this.db.$executeRaw`
      DELETE FROM "ai_workspace_blob_embeddings"
      WHERE workspace_id = ${workspaceId} AND blob_id = ${blobId};
    `;
    return true;
  }

  async removeFile(workspaceId: string, fileId: string) {
    // embeddings will be removed by foreign key constraint
    await this.db.aiWorkspaceFiles.deleteMany({
      where: {
        workspaceId,
        fileId,
      },
    });
    return true;
  }

  private allowEmbedding(workspaceId: string) {
    return this.models.workspace.allowEmbedding(workspaceId);
  }
}
