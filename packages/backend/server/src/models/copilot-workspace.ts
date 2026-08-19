import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';

import { PaginationInput } from '../base';
import { BaseModel } from './base';
import type { IgnoredDoc } from './common';

@Injectable()
export class CopilotWorkspaceConfigModel extends BaseModel {
  @Transactional()
  private async listIgnoredDocIds(
    workspaceId: string,
    options?: PaginationInput
  ) {
    return await this.db.aiWorkspaceIgnoredDocs.findMany({
      where: { workspaceId },
      select: { docId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      skip: options?.offset,
      take: options?.first,
    });
  }

  @Transactional()
  async updateIgnoredDocs(
    workspaceId: string,
    add: string[] = [],
    remove: string[] = []
  ) {
    const removed = new Set(remove);
    const ignored = await this.listIgnoredDocIds(workspaceId).then(
      rows => new Set(rows.map(row => row.docId).filter(id => !removed.has(id)))
    );
    const added = add.filter(id => !ignored.has(id));
    const { count: addedCount } =
      await this.db.aiWorkspaceIgnoredDocs.createMany({
        data: added.map(docId => ({ workspaceId, docId })),
      });
    const { count: removedCount } =
      await this.db.aiWorkspaceIgnoredDocs.deleteMany({
        where: { workspaceId, docId: { in: Array.from(removed) } },
      });
    return addedCount + removedCount;
  }

  @Transactional()
  async listIgnoredDocs(
    workspaceId: string,
    options?: PaginationInput
  ): Promise<IgnoredDoc[]> {
    const rows = await this.listIgnoredDocIds(workspaceId, options);
    const ids = rows.map(row => ({ workspaceId, docId: row.docId }));
    const docs = await this.models.doc.findMetas(ids);
    const docsMap = new Map(
      docs.flatMap(doc =>
        doc ? [[`${doc.workspaceId}-${doc.docId}`, doc] as const] : []
      )
    );
    const authors = await this.models.doc.findAuthors(ids);
    const authorsMap = new Map(
      authors.flatMap(author =>
        author ? [[`${author.workspaceId}-${author.id}`, author] as const] : []
      )
    );
    return rows.map(row => {
      const docMeta = docsMap.get(`${workspaceId}-${row.docId}`);
      const docAuthor = authorsMap.get(`${workspaceId}-${row.docId}`);
      return {
        ...row,
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
    return await this.db.aiWorkspaceIgnoredDocs.count({
      where: { workspaceId },
    });
  }

  @Transactional()
  async checkIgnoredDocs(workspaceId: string, docIds: string[]) {
    const ignored = await this.listIgnoredDocIds(workspaceId).then(
      rows => new Set(rows.map(row => row.docId))
    );
    return docIds.filter(id => ignored.has(id));
  }
}
