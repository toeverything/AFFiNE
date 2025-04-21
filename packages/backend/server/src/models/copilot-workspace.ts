import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';

import { BaseModel } from './base';
import {
  type CopilotWorkspaceFile,
  type Embedding,
  FileChunkSimilarity,
} from './common';

@Injectable()
export class CopilotWorkspaceConfigModel extends BaseModel {
  @Transactional()
  async updateIgnoredDocs(
    workspaceId: string,
    add: string[] = [],
    remove: string[] = []
  ) {
    const removed = new Set(remove);
    const ignored = await this.listIgnoredDocs(workspaceId).then(
      r => new Set(r.filter(id => !removed.has(id)))
    );
    const added = add.filter(id => !ignored.has(id));

    if (added.length) {
      await this.db.aiWorkspaceIgnoredDocs.createMany({
        data: added.map(docId => ({
          workspaceId,
          docId,
        })),
      });
    }

    if (removed.size) {
      await this.db.aiWorkspaceIgnoredDocs.deleteMany({
        where: {
          workspaceId,
          docId: {
            in: Array.from(removed),
          },
        },
      });
    }

    return added.length + ignored.size;
  }

  async listIgnoredDocs(workspaceId: string): Promise<string[]> {
    const row = await this.db.aiWorkspaceIgnoredDocs.findMany({
      where: {
        workspaceId,
      },
      select: {
        docId: true,
      },
    });
    return row.map(r => r.docId);
  }

  @Transactional()
  async checkIgnoredDocs(workspaceId: string, docIds: string[]) {
    const ignored = await this.listIgnoredDocs(workspaceId).then(
      r => new Set(r)
    );

    return docIds.filter(id => ignored.has(id));
  }

  // ================ embeddings ================

  async checkEmbeddingAvailable(): Promise<boolean> {
    const [{ count }] = await this.db.$queryRaw<
      { count: number }[]
    >`SELECT count(1) FROM pg_tables WHERE tablename in ('ai_workspace_file_embeddings')`;
    return Number(count) === 1;
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

  @Transactional()
  async addWorkspaceFile(
    workspaceId: string,
    file: Pick<CopilotWorkspaceFile, 'fileName' | 'mimeType' | 'size'>,
    embeddings: Embedding[]
  ): Promise<string> {
    const fileId = randomUUID();
    await this.db.aiWorkspaceFiles.create({
      data: { ...file, workspaceId, fileId },
    });

    const values = this.processEmbeddings(workspaceId, fileId, embeddings);
    await this.db.$executeRaw`
        INSERT INTO "ai_workspace_file_embeddings"
        ("workspace_id", "file_id", "chunk", "content", "embedding") VALUES ${values}
        ON CONFLICT (workspace_id, file_id, chunk) DO NOTHING;
    `;
    return fileId;
  }

  async listWorkspaceFiles(
    workspaceId: string
  ): Promise<CopilotWorkspaceFile[]> {
    const files = await this.db.aiWorkspaceFiles.findMany({
      where: {
        workspaceId,
      },
    });
    return files;
  }

  async matchWorkspaceFileEmbedding(
    workspaceId: string,
    embedding: number[],
    topK: number,
    threshold: number
  ): Promise<FileChunkSimilarity[]> {
    const similarityChunks = await this.db.$queryRaw<
      Array<FileChunkSimilarity>
    >`
      SELECT "file_id" as "fileId", "chunk", "content", "embedding" <=> ${embedding}::vector as "distance" 
      FROM "ai_workspace_file_embeddings"
      WHERE workspace_id = ${workspaceId}
      ORDER BY "distance" ASC
      LIMIT ${topK};
    `;
    return similarityChunks.filter(c => Number(c.distance) <= threshold);
  }

  async removeWorkspaceFile(workspaceId: string, fileId: string) {
    // embeddings will be removed by foreign key constraint
    await this.db.aiWorkspaceFiles.deleteMany({
      where: {
        workspaceId,
        fileId,
      },
    });
  }
}
