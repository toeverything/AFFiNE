import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';

import { PaginationInput } from '../base';
import { BaseModel } from './base';
import type {
  CopilotWorkspaceFile,
  CopilotWorkspaceFileMetadata,
  Embedding,
  FileChunkSimilarity,
  IgnoredDoc,
} from './common';

@Injectable()
export class CopilotWorkspaceConfigModel extends BaseModel {
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
  @Transactional()
  async findDocsToEmbed(workspaceId: string): Promise<string[]> {
    const ignoredDocIds = (await this.listIgnoredDocIds(workspaceId)).map(
      d => d.docId
    );

    const docIds = await this.db.snapshot
      .findMany({
        where: {
          workspaceId,
          AND: [
            { id: { notIn: ignoredDocIds } },
            { id: { not: workspaceId } },
            { id: { not: { contains: '$' } } },
          ],
          embedding: { none: {} },
        },
        select: { id: true },
      })
      .then(r => r.map(doc => doc.id));

    return docIds;
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

  @Transactional()
  async getWorkspaceEmbeddingStatus(workspaceId: string) {
    const ignoredDocIds = (await this.listIgnoredDocIds(workspaceId)).map(
      d => d.docId
    );
    const snapshotCondition = {
      workspaceId,
      AND: [
        { id: { notIn: ignoredDocIds } },
        { id: { not: workspaceId } },
        { id: { not: { contains: '$' } } },
      ],
    };

    const [docTotal, docEmbedded, fileTotal, fileEmbedded] = await Promise.all([
      this.db.snapshot.count({ where: snapshotCondition }),
      this.db.snapshot.count({
        where: { ...snapshotCondition, embedding: { some: {} } },
      }),
      this.db.aiWorkspaceFiles.count({ where: { workspaceId } }),
      this.db.aiWorkspaceFiles.count({
        where: { workspaceId, embeddings: { some: {} } },
      }),
    ]);

    return {
      total: docTotal + fileTotal,
      embedded: docEmbedded + fileEmbedded,
    };
  }

  @Transactional()
  async checkDocNeedEmbedded(workspaceId: string, docId: string) {
    // NOTE: check if the document needs re-embedding.
    // 1. check if there have been any recent updates to the document snapshot and update
    // 2. check if the embedding is older than the snapshot and update
    // 3. check if the embedding is older than 10 minutes (avoid frequent updates)
    // if all conditions are met, re-embedding is required.
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
            OR docs.updated_at > e.updated_at
            OR e.updated_at < NOW() - INTERVAL '10 minutes'
        ) AS needs_embedding;
    `;

    return result[0]?.needs_embedding ?? false;
  }

  // ================ embeddings ================

  async checkEmbeddingAvailable(): Promise<boolean> {
    const [{ count }] = await this.db.$queryRaw<
      { count: number }[]
    >`SELECT count(1) FROM pg_tables WHERE tablename in ('ai_workspace_embeddings', 'ai_workspace_file_embeddings')`;
    return Number(count) === 2;
  }

  private processEmbeddings(
    workspaceId: string,
    fileId: string,
    embeddings: Embedding[]
  ) {
    const groups = embeddings.map(e =>
      [
        workspaceId,
        fileId,
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
