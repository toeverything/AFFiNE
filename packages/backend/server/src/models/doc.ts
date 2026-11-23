import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type { Update, WorkspaceDoc } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { EventBus, PaginationInput } from '../base';
import { BadRequest, DocIsNotPublic, NotFound } from '../base/error';
import { isOrdinaryWorkspaceDoc } from '../native';
import { BaseModel } from './base';
import { Doc, DocRole, PublicDocMode, publicUserSelect } from './common';
import {
  docInfoProjection,
  type DocInfoRow,
  parseDocCursor,
  workspaceDocSources,
} from './doc-source';

declare global {
  interface Events {
    'doc.created': {
      workspaceId: string;
      docId: string;
      editor?: string;
    };
    'doc.updated': {
      workspaceId: string;
      docId: string;
    };
    'doc.public_state.changed': {
      workspaceId: string;
      docId: string;
    };
    'doc.default_role.changed': {
      workspaceId: string;
      docId: string;
    };
  }
}

export type DocMetaUpsertInput = Pick<
  Prisma.WorkspaceDocUncheckedCreateInput,
  'mode' | 'blocked' | 'title' | 'summary' | 'publishedAt'
> & {
  public?: boolean;
  defaultRole?: DocRole;
};

/**
 * Workspace Doc Model
 *
 * This model is responsible for managing the workspace docs, including:
 *  - Updates: the changes made to the doc.
 *  - History: the doc history of the doc.
 *  - Doc: the doc itself.
 *  - DocMeta: the doc meta.
 */
@Injectable()
export class DocModel extends BaseModel {
  constructor(private readonly event: EventBus) {
    super();
  }

  private docRoleFromPolicy(role: string | null | undefined) {
    switch (role) {
      case 'none':
        return DocRole.None;
      case 'reader':
        return DocRole.Reader;
      case 'commenter':
        return DocRole.Commenter;
      case 'editor':
        return DocRole.Editor;
      case 'owner':
        return DocRole.Owner;
      case 'manager':
      default:
        return DocRole.Manager;
    }
  }

  // #region Update

  private updateToDocRecord(row: Update): Doc {
    return {
      spaceId: row.workspaceId,
      docId: row.id,
      blob: row.blob,
      timestamp: row.createdAt.getTime(),
      editorId: row.createdBy || undefined,
    };
  }

  private docRecordToUpdate(record: Doc): Prisma.UpdateCreateManyInput {
    return {
      workspaceId: record.spaceId,
      id: record.docId,
      blob: record.blob,
      createdAt: new Date(record.timestamp),
      createdBy: record.editorId || null,
    };
  }

  async createUpdates(updates: Doc[]) {
    return await this.db.update.createMany({
      data: updates.map(r => this.docRecordToUpdate(r)),
    });
  }

  /**
   * Find updates by workspaceId and docId.
   */
  async findUpdates(workspaceId: string, docId: string): Promise<Doc[]> {
    const rows = await this.db.update.findMany({
      where: {
        workspaceId,
        id: docId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 100,
    });
    return rows.map(r => this.updateToDocRecord(r));
  }

  /**
   * Get the pending updates count by workspaceId and docId.
   */
  async getUpdateCount(workspaceId: string, docId: string) {
    return await this.db.update.count({
      where: {
        workspaceId,
        id: docId,
      },
    });
  }

  /**
   * Get the global pending updates count.
   */
  async getGlobalUpdateCount() {
    return await this.db.update.count();
  }

  async groupedUpdatesCount(limit = 100) {
    return await this.db.update.groupBy({
      by: ['workspaceId', 'id'],
      _count: true,
      orderBy: [{ workspaceId: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }

  /**
   * Delete updates by workspaceId, docId, and createdAts.
   */
  async deleteUpdates(
    workspaceId: string,
    docId: string,
    timestamps: number[]
  ) {
    const { count } = await this.db.update.deleteMany({
      where: {
        workspaceId,
        id: docId,
        createdAt: {
          in: timestamps.map(t => new Date(t)),
        },
      },
    });
    if (count > 0) {
      this.logger.verbose(
        `Deleted ${count} updates for workspace ${workspaceId} doc ${docId}`
      );
    }
    return count;
  }

  // #endregion

  // #region Doc

  /**
   * insert or update a doc.
   */
  async upsert(doc: Doc) {
    const { spaceId, docId, blob, timestamp, editorId } = doc;
    if (spaceId === docId) {
      throw new BadRequest(
        'Workspace indexes must use the root update writer.'
      );
    }
    const updatedAt = new Date(timestamp);
    const size = blob.byteLength ?? blob.length;
    // CONCERNS:
    //   i. Because we save the real user's last seen action time as `updatedAt`,
    //      it's possible to simply compare the `updatedAt` to determine if the snapshot is older than the one we are going to save.
    //
    //  ii. Prisma doesn't support `upsert` with additional `where` condition along side unique constraint.
    //      In our case, we need to manually check the `updatedAt` to avoid overriding the newer snapshot.
    //      where: { workspaceId_id: {}, updatedAt: { lt: updatedAt } }
    //                                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    const result: { updatedAt: Date }[] = await this.db.$queryRaw`
      INSERT INTO "snapshots" ("workspace_id", "guid", "blob", "size", "created_at", "updated_at", "created_by", "updated_by")
      VALUES (${spaceId}, ${docId}, ${blob}, ${size}, ${updatedAt}, ${updatedAt}, ${editorId}, ${editorId})
      ON CONFLICT ("workspace_id", "guid")
      DO UPDATE SET "blob" = ${blob}, "size" = ${size}, "updated_at" = ${updatedAt}, "updated_by" = ${editorId}
      WHERE "snapshots"."workspace_id" = ${spaceId} AND "snapshots"."guid" = ${docId} AND "snapshots"."updated_at" <= ${updatedAt}
      RETURNING "snapshots"."workspace_id" as "workspaceId", "snapshots"."guid" as "id", "snapshots"."updated_at" as "updatedAt"
    `;

    return result.at(0);
  }

  /**
   * Get a doc by workspaceId and docId.
   */
  async get(workspaceId: string, docId: string): Promise<Doc | null> {
    const row = await this.getSnapshot(workspaceId, docId);
    if (!row) {
      return null;
    }
    return {
      spaceId: row.workspaceId,
      docId: row.id,
      blob: row.blob,
      timestamp: row.updatedAt.getTime(),
      editorId: row.updatedBy || undefined,
    };
  }

  async getSnapshot<Select extends Prisma.SnapshotSelect>(
    workspaceId: string,
    docId: string,
    options?: { select?: Select }
  ) {
    return (await this.db.snapshot.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: docId,
        },
      },
      select: options?.select,
    })) as Prisma.SnapshotGetPayload<{ select: Select }> | null;
  }

  async getAuthors(workspaceId: string, docId: string) {
    const doc = await this.getDocInfo(workspaceId, docId);
    if (!doc) return null;
    const users = await this.db.user.findMany({
      where: {
        id: {
          in: [doc.creatorId, doc.lastUpdaterId].filter(
            (id): id is string => id !== null
          ),
        },
      },
      select: publicUserSelect,
    });
    return {
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      createdByUser: users.find(user => user.id === doc.creatorId) ?? null,
      updatedByUser: users.find(user => user.id === doc.lastUpdaterId) ?? null,
    };
  }

  /**
   * Check if all doc exists in the workspace.
   * Ignore pending updates.
   */
  async existsAll(workspaceId: string, docIds: string[]) {
    const count = await this.db.snapshot.count({
      where: {
        workspaceId,
        id: { in: docIds },
      },
    });
    if (count === docIds.length) {
      return true;
    }
    return false;
  }

  /**
   * Detect a doc exists or not, including updates
   */
  async exists(workspaceId: string, docId: string) {
    const count = await this.db.snapshot.count({
      where: {
        workspaceId,
        id: docId,
      },
    });
    if (count > 0) {
      return true;
    }

    const updateCount = await this.getUpdateCount(workspaceId, docId);
    return updateCount > 0;
  }

  /**
   * Delete a doc and it's updates and snapshots.
   */
  @Transactional()
  async delete(workspaceId: string, docId: string) {
    const ident = { where: { workspaceId, id: docId } };
    const { count: snapshots } = await this.db.snapshot.deleteMany(ident);
    const { count: updates } = await this.db.update.deleteMany(ident);
    const { count: histories } =
      await this.db.snapshotHistory.deleteMany(ident);
    this.logger.log(
      `Deleted workspace ${workspaceId} doc ${docId}, including ${snapshots} snapshots, ${updates} updates, and ${histories} histories`
    );
  }

  /**
   * Delete the whole workspace's docs and their updates and snapshots.
   */
  @Transactional()
  async deleteAllByWorkspaceId(workspaceId: string) {
    const ident = { where: { workspaceId } };
    const { count: snapshots } = await this.db.snapshot.deleteMany(ident);
    const { count: updates } = await this.db.update.deleteMany(ident);
    const { count: histories } =
      await this.db.snapshotHistory.deleteMany(ident);
    this.logger.log(
      `Deleted workspace ${workspaceId} all docs, including ${snapshots} snapshots, ${updates} updates, and ${histories} histories`
    );
    return snapshots;
  }

  /**
   * Find the timestamps of docs by workspaceId.
   *
   * @param after Only return timestamps after this timestamp.
   */
  async findTimestampsByWorkspaceId(workspaceId: string, after?: number) {
    const snapshots = await this.db.snapshot.findMany({
      select: {
        id: true,
        updatedAt: true,
      },
      where: {
        workspaceId,
        ...(after
          ? {
              updatedAt: {
                gt: new Date(after),
              },
            }
          : {}),
      },
    });

    const updates = await this.db.update.groupBy({
      where: {
        workspaceId,
        ...(after
          ? {
              // [createdAt] in updates table is indexed, so it's fast
              createdAt: {
                gt: new Date(after),
              },
            }
          : {}),
      },
      by: ['id'],
      _max: {
        createdAt: true,
      },
    });

    const result: Record<string, number> = {};

    snapshots.forEach(s => {
      result[s.id] = s.updatedAt.getTime();
    });

    updates.forEach(u => {
      if (u._max.createdAt) {
        result[u.id] = u._max.createdAt.getTime();
      }
    });

    return result;
  }

  // #endregion

  // #region DocMeta

  /**
   * Create or update the doc meta.
   */
  @Transactional()
  async upsertMeta(
    workspaceId: string,
    docId: string,
    data?: DocMetaUpsertInput
  ) {
    for (const [key, shared] of [
      [`storage-workspace:${workspaceId}`, true],
      [`workspace-doc-update:${workspaceId}/${docId}`, false],
    ] as const) {
      for (;;) {
        const [lock] = await this.db.$queryRaw<
          { locked: boolean }[]
        >`SELECT CASE WHEN ${shared} THEN pg_try_advisory_xact_lock_shared(hashtextextended(${key},0)) ELSE pg_try_advisory_xact_lock(hashtextextended(${key},0)) END AS locked`;
        if (lock.locked) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    const current = await this.db.workspaceDoc.findUnique({
      where: { workspaceId_docId: { workspaceId, docId } },
      select: { lifecycleState: true },
    });
    if (current?.lifecycleState === 'deleted')
      throw new NotFound('Document not found');
    const {
      public: isPublic,
      defaultRole,
      publishedAt,
      mode,
      blocked,
      title,
      summary,
    } = data ?? {};
    const meta = { mode, blocked, title, summary };
    const policyPublishedAt =
      publishedAt == null ? publishedAt : new Date(publishedAt);
    if (
      data &&
      ('public' in data || 'defaultRole' in data || 'publishedAt' in data)
    ) {
      await this.models.docAccessPolicy.upsert(workspaceId, docId, {
        public: isPublic,
        defaultRole,
        publishedAt: policyPublishedAt,
      });
    }

    const doc = await this.db.workspaceDoc.upsert({
      where: {
        workspaceId_docId: {
          workspaceId,
          docId,
        },
      },
      update: {
        ...meta,
        publishedAt,
      },
      create: {
        ...meta,
        publishedAt,
        workspaceId,
        docId,
      },
    });
    this.event.emit('doc.updated', {
      workspaceId,
      docId,
    });
    const policy = await this.db.docAccessPolicy.findUnique({
      where: { workspaceId_docId: { workspaceId, docId } },
    });
    return {
      ...doc,
      public: policy?.visibility === 'public',
      defaultRole: this.docRoleFromPolicy(policy?.memberDefaultRole),
    };
  }

  /**
   * Get the doc meta.
   */
  async getMeta(
    workspaceId: string,
    docId: string
  ): Promise<(WorkspaceDoc & { public: boolean; defaultRole: DocRole }) | null>;
  async getMeta<Select extends Prisma.WorkspaceDocSelect>(
    workspaceId: string,
    docId: string,
    options: {
      select: Select;
    }
  ): Promise<Prisma.WorkspaceDocGetPayload<{ select: Select }> | null>;
  async getMeta(
    workspaceId: string,
    docId: string,
    options?: { select: Prisma.WorkspaceDocSelect }
  ): Promise<unknown> {
    const doc = await this.db.workspaceDoc.findUnique({
      where: {
        workspaceId_docId: {
          workspaceId,
          docId,
        },
      },
      select: options?.select,
    });
    if (!doc || options?.select) {
      return doc;
    }
    const policy = await this.db.docAccessPolicy.findUnique({
      where: { workspaceId_docId: { workspaceId, docId } },
    });
    return {
      ...doc,
      public: policy?.visibility === 'public',
      defaultRole: this.docRoleFromPolicy(policy?.memberDefaultRole),
    };
  }

  async setDefaultRole(workspaceId: string, docId: string, role: DocRole) {
    return await this.upsertMeta(workspaceId, docId, {
      defaultRole: role,
    });
  }

  async findDefaultRoles(workspaceId: string, docIds: string[]) {
    const policies = await this.db.docAccessPolicy.findMany({
      where: { workspaceId, docId: { in: docIds } },
    });
    const byDocId = new Map(policies.map(policy => [policy.docId, policy]));

    return docIds.map(docId => ({
      external:
        byDocId.get(docId)?.publicRole === 'external' ? DocRole.External : null,
      workspace: this.docRoleFromPolicy(byDocId.get(docId)?.memberDefaultRole),
    }));
  }

  async findAuthors(ids: { workspaceId: string; docId: string }[]) {
    const workspaces = new Map<string, string[]>();
    for (const id of ids) {
      const docs = workspaces.get(id.workspaceId) ?? [];
      docs.push(id.docId);
      workspaces.set(id.workspaceId, docs);
    }
    const docs = (
      await Promise.all(
        [...workspaces].map(
          ([workspaceId, docIds]) =>
            this.db.$queryRaw<
              DocInfoRow[]
            >`${workspaceDocSources(workspaceId, docIds)} ${docInfoProjection}`
        )
      )
    ).flat();
    const userIds = [
      ...new Set(
        docs
          .flatMap(doc => [doc.creatorId, doc.lastUpdaterId])
          .filter((id): id is string => id !== null)
      ),
    ];
    const users = new Map(
      (
        await this.db.user.findMany({
          where: { id: { in: userIds } },
          select: publicUserSelect,
        })
      ).map(user => [user.id, user])
    );
    const authors = new Map(
      docs.map(doc => [
        `${doc.workspaceId}:${doc.docId}`,
        {
          workspaceId: doc.workspaceId,
          id: doc.docId,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
          createdByUser: doc.creatorId
            ? (users.get(doc.creatorId) ?? null)
            : null,
          updatedByUser: doc.lastUpdaterId
            ? (users.get(doc.lastUpdaterId) ?? null)
            : null,
        },
      ])
    );
    return ids.map(id => authors.get(`${id.workspaceId}:${id.docId}`) ?? null);
  }

  async findMetas<Select extends Prisma.WorkspaceDocSelect>(
    ids: { workspaceId: string; docId: string }[],
    options?: { select?: Select }
  ) {
    let select = options?.select;
    if (select) {
      // add workspaceId and docId to the select
      select = {
        ...select,
        workspaceId: true,
        docId: true,
      };
    }
    const rows = (await this.db.workspaceDoc.findMany({
      where: {
        workspaceId: { in: ids.map(id => id.workspaceId) },
        docId: { in: ids.map(id => id.docId) },
      },
      select,
    })) as (Prisma.WorkspaceDocGetPayload<{ select: Select }> & {
      workspaceId: string;
      docId: string;
    })[];
    const resultMap = new Map(
      rows.map(row => [`${row.workspaceId}-${row.docId}`, row])
    );
    return ids.map(
      id => resultMap.get(`${id.workspaceId}-${id.docId}`) ?? null
    );
  }

  /**
   * Find the workspace public doc metas.
   */
  async findPublics(workspaceId: string, order: 'asc' | 'desc' = 'asc') {
    const ids = await this.listWorkspaceDocIds(workspaceId, true);
    const direction = order === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const rows = await this.db.$queryRaw<
      DocInfoRow[]
    >`${workspaceDocSources(workspaceId, ids)} ${docInfoProjection} AND policy.visibility='public' AND policy.public_role='external' AND policy.published_at IS NOT NULL AND workspace_pages.published_at IS NOT NULL ORDER BY workspace_pages.published_at ${direction}`;
    return rows.map(({ defaultRolePolicy, ...doc }) => ({
      ...doc,
      defaultRole: this.docRoleFromPolicy(defaultRolePolicy),
    }));
  }

  /**
   * Get the workspace public docs count.
   */
  async getPublicsCount(workspaceId: string) {
    const ids = await this.listWorkspaceDocIds(workspaceId, true);
    const [row] = await this.db.$queryRaw<
      { count: bigint }[]
    >`${workspaceDocSources(workspaceId, ids)} SELECT count(*) AS count FROM doc_sources source JOIN workspace_pages page ON page.workspace_id=source.workspace_id AND page.page_id=source.doc_id JOIN doc_access_policies policy ON policy.workspace_id=source.workspace_id AND policy.doc_id=source.doc_id WHERE page.lifecycle_state IS DISTINCT FROM 'deleted' AND policy.visibility='public' AND policy.public_role='external' AND policy.published_at IS NOT NULL AND page.published_at IS NOT NULL`;
    return Number(row.count);
  }

  /**
   * Check if the workspace has any public docs.
   */
  async hasPublic(workspaceId: string) {
    const count = await this.getPublicsCount(workspaceId);
    return count > 0;
  }

  /**
   * Publish a doc as public.
   */
  async publish(
    workspaceId: string,
    docId: string,
    mode: PublicDocMode = PublicDocMode.Page
  ) {
    return await this.upsertMeta(workspaceId, docId, {
      public: true,
      mode,
      publishedAt: new Date(),
    });
  }

  @Transactional()
  async unpublish(workspaceId: string, docId: string) {
    if (!(await this.isPublic(workspaceId, docId))) {
      throw new DocIsNotPublic();
    }

    return await this.upsertMeta(workspaceId, docId, {
      public: false,
      publishedAt: null,
    });
  }

  /**
   * Check if the doc is public.
   */
  async isPublic(workspaceId: string, docId: string) {
    const policy = await this.db.docAccessPolicy.findUnique({
      where: { workspaceId_docId: { workspaceId, docId } },
      select: { visibility: true, publicRole: true },
    });
    return policy?.visibility === 'public' && policy.publicRole === 'external';
  }

  async getDocInfo(workspaceId: string, docId: string) {
    const [row] = await this.db.$queryRaw<
      DocInfoRow[]
    >`${workspaceDocSources(workspaceId, [docId])} ${docInfoProjection}`;
    if (!row) return null;
    const { defaultRolePolicy, ...doc } = row;
    return { ...doc, defaultRole: this.docRoleFromPolicy(defaultRolePolicy) };
  }

  async paginateDocInfo(workspaceId: string, pagination: PaginationInput) {
    const ids = await this.listWorkspaceDocIds(workspaceId);
    const cursor = pagination.after ? parseDocCursor(pagination.after) : null;
    const after = cursor
      ? cursor.docId === null
        ? Prisma.sql`AND source.created_at > ${cursor.timestamp}`
        : Prisma.sql`AND (source.created_at,source.doc_id) > (${cursor.timestamp},${cursor.docId})`
      : Prisma.empty;
    const rows = await this.db.$queryRaw<
      DocInfoRow[]
    >`${workspaceDocSources(workspaceId, ids)} ${docInfoProjection} AND workspace_pages.lifecycle_state IS NULL ${after} ORDER BY source.created_at,source.doc_id LIMIT ${pagination.first} OFFSET ${pagination.offset}`;
    return [
      ids.length,
      rows.map(({ defaultRolePolicy, ...doc }) => ({
        ...doc,
        defaultRole: this.docRoleFromPolicy(defaultRolePolicy),
        cursor: JSON.stringify([doc.createdAt.toISOString(), doc.docId]),
      })),
    ] as const;
  }

  async paginateDocInfoByUpdatedAt(
    workspaceId: string,
    pagination: PaginationInput,
    readablePredicate: Prisma.Sql = Prisma.sql`TRUE`
  ) {
    const ids = await this.listWorkspaceDocIds(workspaceId);
    const [count] = await this.db.$queryRaw<
      { count: bigint }[]
    >`${workspaceDocSources(workspaceId, ids)} SELECT count(*) AS count FROM doc_sources source LEFT JOIN workspace_pages ON workspace_pages.workspace_id=source.workspace_id AND workspace_pages.page_id=source.doc_id WHERE workspace_pages.lifecycle_state IS NULL AND ${readablePredicate}`;
    const cursor = pagination.after ? parseDocCursor(pagination.after) : null;
    const after = cursor
      ? cursor.docId === null
        ? Prisma.sql`AND source.updated_at < ${cursor.timestamp}`
        : Prisma.sql`AND (source.updated_at < ${cursor.timestamp} OR (source.updated_at = ${cursor.timestamp} AND source.doc_id > ${cursor.docId}))`
      : Prisma.empty;
    const rows = await this.db.$queryRaw<
      DocInfoRow[]
    >`${workspaceDocSources(workspaceId, ids)} ${docInfoProjection} AND workspace_pages.lifecycle_state IS NULL AND ${readablePredicate} ${after} ORDER BY source.updated_at DESC,source.doc_id LIMIT ${pagination.first} OFFSET ${pagination.offset}`;
    return [
      Number(count.count),
      rows.map(({ defaultRolePolicy, ...doc }) => ({
        ...doc,
        defaultRole: this.docRoleFromPolicy(defaultRolePolicy),
        cursor: JSON.stringify([doc.updatedAt.toISOString(), doc.docId]),
      })),
    ] as const;
  }

  async listWorkspaceDocIds(workspaceId: string, includeTrashed = false) {
    const lifecycle = includeTrashed
      ? Prisma.sql`workspace_pages.lifecycle_state IS DISTINCT FROM 'deleted'`
      : Prisma.sql`workspace_pages.lifecycle_state IS NULL`;
    const rows = await this.db.$queryRaw<
      { docId: string }[]
    >`${workspaceDocSources(workspaceId)} SELECT source.doc_id AS "docId" FROM doc_sources source LEFT JOIN workspace_pages ON workspace_pages.workspace_id=source.workspace_id AND workspace_pages.page_id=source.doc_id WHERE ${lifecycle} ORDER BY source.doc_id`;
    return rows
      .map(row => row.docId)
      .filter(docId => isOrdinaryWorkspaceDoc(workspaceId, docId));
  }

  async findEmptySummaryDocIds(workspaceId: string) {
    const rows = await this.db.workspaceDoc.findMany({
      where: {
        workspaceId,
        summary: null,
      },
      select: {
        docId: true,
      },
    });
    return rows.map(row => row.docId);
  }

  // #endregion
}
