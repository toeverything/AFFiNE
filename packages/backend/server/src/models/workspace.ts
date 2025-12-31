import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { Prisma, type Workspace, WorkspaceMemberStatus } from '@prisma/client';

import { EventBus } from '../base';
import { BaseModel } from './base';
import type { WorkspaceFeatureName } from './common';
import { WorkspaceRole } from './common/role';

type RawWorkspaceSummary = {
  id: string;
  public: boolean;
  createdAt: Date;
  name: string | null;
  avatarKey: string | null;
  enableAi: boolean;
  enableUrlPreview: boolean;
  enableDocEmbedding: boolean;
  memberCount: bigint | number | null;
  publicPageCount: bigint | number | null;
  snapshotCount: bigint | number | null;
  snapshotSize: bigint | number | null;
  blobCount: bigint | number | null;
  blobSize: bigint | number | null;
  features: WorkspaceFeatureName[] | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerAvatarUrl: string | null;
};

export type AdminWorkspaceSummary = {
  id: string;
  public: boolean;
  createdAt: Date;
  name: string | null;
  avatarKey: string | null;
  enableAi: boolean;
  enableUrlPreview: boolean;
  enableDocEmbedding: boolean;
  memberCount: number;
  publicPageCount: number;
  snapshotCount: number;
  snapshotSize: number;
  blobCount: number;
  blobSize: number;
  features: WorkspaceFeatureName[];
  owner: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  } | null;
};

declare global {
  interface Events {
    'workspace.updated': Workspace;
    'workspace.deleted': {
      id: string;
    };
  }
}

export type { Workspace };
export type UpdateWorkspaceInput = Pick<
  Partial<Workspace>,
  | 'public'
  | 'enableAi'
  | 'enableUrlPreview'
  | 'enableDocEmbedding'
  | 'name'
  | 'avatarKey'
  | 'indexed'
  | 'lastCheckEmbeddings'
>;

@Injectable()
export class WorkspaceModel extends BaseModel {
  constructor(private readonly event: EventBus) {
    super();
  }

  // #region workspace
  /**
   * Create a new workspace for the user, default to private.
   */
  @Transactional()
  async create(userId: string) {
    const workspace = await this.db.workspace.create({
      data: { public: false },
    });
    this.logger.log(`Workspace created with id ${workspace.id}`);
    await this.models.workspaceUser.setOwner(workspace.id, userId);
    return workspace;
  }

  /**
   * Update the workspace with the given data.
   */
  async update(
    workspaceId: string,
    data: UpdateWorkspaceInput,
    notifyUpdate = true
  ) {
    const workspace = await this.db.workspace.update({
      where: {
        id: workspaceId,
      },
      data,
    });
    this.logger.debug(
      `Updated workspace ${workspaceId} with data ${JSON.stringify(data)}`
    );

    if (notifyUpdate) {
      this.event.emit('workspace.updated', workspace);
    }

    return workspace;
  }

  async get(workspaceId: string) {
    return await this.db.workspace.findUnique({
      where: {
        id: workspaceId,
      },
    });
  }

  async findMany(ids: string[]) {
    return await this.db.workspace.findMany({
      where: {
        id: { in: ids },
      },
    });
  }

  async list<S extends Prisma.WorkspaceSelect>(
    where: Prisma.WorkspaceWhereInput = {},
    select?: S,
    limit?: number
  ) {
    return (await this.db.workspace.findMany({
      where,
      select,
      take: limit,
      orderBy: {
        sid: 'asc',
      },
    })) as Prisma.WorkspaceGetPayload<{ select: S }>[];
  }

  async delete(workspaceId: string) {
    const rawResult = await this.db.workspace.deleteMany({
      where: {
        id: workspaceId,
      },
    });

    if (rawResult.count > 0) {
      this.event.emit('workspace.deleted', { id: workspaceId });
      this.logger.log(`Workspace [${workspaceId}] deleted`);
    }
  }

  async allowUrlPreview(workspaceId: string) {
    const workspace = await this.get(workspaceId);
    return workspace?.enableUrlPreview ?? false;
  }

  async allowEmbedding(workspaceId: string) {
    const workspace = await this.get(workspaceId);
    return workspace?.enableDocEmbedding ?? false;
  }

  async isTeamWorkspace(workspaceId: string) {
    return this.models.workspaceFeature.has(workspaceId, 'team_plan_v1');
  }
  // #endregion

  // #region admin
  async adminListWorkspaces(options: {
    skip: number;
    first: number;
    keyword?: string | null;
    features?: WorkspaceFeatureName[] | null;
    order?: 'createdAt' | 'snapshotSize' | 'blobCount' | 'blobSize';
    includeTotal?: boolean;
  }): Promise<{ rows: AdminWorkspaceSummary[]; total: number }> {
    const keyword = options.keyword?.trim();
    const features = options.features ?? [];
    const includeTotal = options.includeTotal ?? true;
    const total = includeTotal
      ? await this.adminCountWorkspaces({ keyword, features })
      : 0;
    if (includeTotal && total === 0) {
      return { rows: [], total: 0 };
    }

    const rows =
      options.order === 'createdAt' || !options.order
        ? await this.db.$queryRaw<RawWorkspaceSummary[]>`
            WITH feature_set AS (
              SELECT workspace_id, array_agg(DISTINCT name) FILTER (WHERE activated) AS features
              FROM workspace_features
              GROUP BY workspace_id
            ),
            owner AS (
              SELECT wur.workspace_id,
                     u.id   AS owner_id,
                     u.name AS owner_name,
                     u.email AS owner_email,
                     u.avatar_url AS owner_avatar_url
              FROM workspace_user_permissions AS wur
              JOIN users u ON wur.user_id = u.id
              WHERE wur.type = ${WorkspaceRole.Owner}
              AND wur.status = ${Prisma.sql`${WorkspaceMemberStatus.Accepted}::"WorkspaceMemberStatus"`}
            ),
            filtered AS (
              SELECT w.id,
                     w.public,
                     w.created_at AS "createdAt",
                     w.name,
                     w.avatar_key AS "avatarKey",
                     w.enable_ai AS "enableAi",
                     w.enable_url_preview AS "enableUrlPreview",
                     w.enable_doc_embedding AS "enableDocEmbedding",
                     COALESCE(fs.features, ARRAY[]::text[]) AS features,
                     o.owner_id AS "ownerId",
                     o.owner_name AS "ownerName",
                     o.owner_email AS "ownerEmail",
                     o.owner_avatar_url AS "ownerAvatarUrl"
              FROM workspaces w
              LEFT JOIN feature_set fs ON fs.workspace_id = w.id
              LEFT JOIN owner o ON o.workspace_id = w.id
              WHERE ${
                keyword
                  ? Prisma.sql`
                      (
                        w.id ILIKE ${'%' + keyword + '%'}
                        OR o.owner_id ILIKE ${'%' + keyword + '%'}
                        OR o.owner_email ILIKE ${'%' + keyword + '%'}
                      )
                    `
                  : Prisma.sql`TRUE`
              }
              AND ${
                features.length
                  ? Prisma.sql`COALESCE(fs.features, ARRAY[]::text[]) @> ${features}`
                  : Prisma.sql`TRUE`
              }
              ORDER BY w.created_at DESC
              LIMIT ${options.first}
              OFFSET ${options.skip}
            )
            SELECT f.*,
                   COALESCE(ms.member_count, 0) AS "memberCount",
                   COALESCE(pp.public_page_count, 0) AS "publicPageCount",
                   COALESCE(ss.snapshot_count, 0) AS "snapshotCount",
                   COALESCE(ss.snapshot_size, 0) AS "snapshotSize",
                   COALESCE(bs.blob_count, 0) AS "blobCount",
                   COALESCE(bs.blob_size, 0) AS "blobSize"
            FROM filtered f
            LEFT JOIN LATERAL (
              SELECT COUNT(*) AS member_count
              FROM workspace_user_permissions
              WHERE workspace_id = f.id
            ) ms ON TRUE
            LEFT JOIN LATERAL (
              SELECT COUNT(*) AS public_page_count
              FROM workspace_pages
              WHERE workspace_id = f.id AND public = true
            ) pp ON TRUE
            LEFT JOIN LATERAL (
              SELECT COUNT(*) AS snapshot_count,
                     SUM(size) AS snapshot_size
              FROM snapshots
              WHERE workspace_id = f.id
            ) ss ON TRUE
            LEFT JOIN LATERAL (
              SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'completed') AS blob_count,
                     SUM(size) FILTER (WHERE deleted_at IS NULL AND status = 'completed') AS blob_size
              FROM blobs
              WHERE workspace_id = f.id
            ) bs ON TRUE
            ORDER BY f."createdAt" DESC
          `
        : await this.db.$queryRaw<RawWorkspaceSummary[]>`
            WITH feature_set AS (
              SELECT workspace_id, array_agg(DISTINCT name) FILTER (WHERE activated) AS features
              FROM workspace_features
              GROUP BY workspace_id
            ),
            owner AS (
              SELECT wur.workspace_id,
                     u.id   AS owner_id,
                     u.name AS owner_name,
                     u.email AS owner_email,
                     u.avatar_url AS owner_avatar_url
              FROM workspace_user_permissions AS wur
              JOIN users u ON wur.user_id = u.id
              WHERE wur.type = ${WorkspaceRole.Owner}
              AND wur.status = ${Prisma.sql`${WorkspaceMemberStatus.Accepted}::"WorkspaceMemberStatus"`}
            ),
            filtered AS (
              SELECT w.id,
                     w.public,
                     w.created_at AS "createdAt",
                     w.name,
                     w.avatar_key AS "avatarKey",
                     w.enable_ai AS "enableAi",
                     w.enable_url_preview AS "enableUrlPreview",
                     w.enable_doc_embedding AS "enableDocEmbedding",
                     COALESCE(fs.features, ARRAY[]::text[]) AS features,
                     o.owner_id AS "ownerId",
                     o.owner_name AS "ownerName",
                     o.owner_email AS "ownerEmail",
                     o.owner_avatar_url AS "ownerAvatarUrl"
              FROM workspaces w
              LEFT JOIN feature_set fs ON fs.workspace_id = w.id
              LEFT JOIN owner o ON o.workspace_id = w.id
              WHERE ${
                keyword
                  ? Prisma.sql`
                      (
                        w.id ILIKE ${'%' + keyword + '%'}
                        OR o.owner_id ILIKE ${'%' + keyword + '%'}
                        OR o.owner_email ILIKE ${'%' + keyword + '%'}
                      )
                    `
                  : Prisma.sql`TRUE`
              }
              AND ${
                features.length
                  ? Prisma.sql`COALESCE(fs.features, ARRAY[]::text[]) @> ${features}`
                  : Prisma.sql`TRUE`
              }
            ),
            snapshot_stats AS (
              SELECT workspace_id,
                     SUM(size) AS snapshot_size,
                     COUNT(*) AS snapshot_count
              FROM snapshots
              WHERE workspace_id IN (SELECT id FROM filtered)
              GROUP BY workspace_id
            ),
            blob_stats AS (
              SELECT workspace_id,
                     SUM(size) FILTER (WHERE deleted_at IS NULL AND status = 'completed') AS blob_size,
                     COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'completed') AS blob_count
              FROM blobs
              WHERE workspace_id IN (SELECT id FROM filtered)
              GROUP BY workspace_id
            ),
            member_stats AS (
              SELECT workspace_id, COUNT(*) AS member_count
              FROM workspace_user_permissions
              WHERE workspace_id IN (SELECT id FROM filtered)
              GROUP BY workspace_id
            ),
            public_pages AS (
              SELECT workspace_id, COUNT(*) AS public_page_count
              FROM workspace_pages
              WHERE public = true AND workspace_id IN (SELECT id FROM filtered)
              GROUP BY workspace_id
            )
            SELECT f.*,
                   COALESCE(ms.member_count, 0) AS "memberCount",
                   COALESCE(pp.public_page_count, 0) AS "publicPageCount",
                   COALESCE(ss.snapshot_count, 0) AS "snapshotCount",
                   COALESCE(ss.snapshot_size, 0) AS "snapshotSize",
                   COALESCE(bs.blob_count, 0) AS "blobCount",
                   COALESCE(bs.blob_size, 0) AS "blobSize"
            FROM filtered f
            LEFT JOIN snapshot_stats ss ON ss.workspace_id = f.id
            LEFT JOIN blob_stats bs ON bs.workspace_id = f.id
            LEFT JOIN member_stats ms ON ms.workspace_id = f.id
            LEFT JOIN public_pages pp ON pp.workspace_id = f.id
            ORDER BY ${Prisma.raw(this.buildAdminOrder(options.order))}
            LIMIT ${options.first}
            OFFSET ${options.skip}
          `;

    const mapped = rows.map(row => ({
      id: row.id,
      public: row.public,
      createdAt: row.createdAt,
      name: row.name,
      avatarKey: row.avatarKey,
      enableAi: row.enableAi,
      enableUrlPreview: row.enableUrlPreview,
      enableDocEmbedding: row.enableDocEmbedding,
      memberCount: Number(row.memberCount ?? 0),
      publicPageCount: Number(row.publicPageCount ?? 0),
      snapshotCount: Number(row.snapshotCount ?? 0),
      snapshotSize: Number(row.snapshotSize ?? 0),
      blobCount: Number(row.blobCount ?? 0),
      blobSize: Number(row.blobSize ?? 0),
      features: (row.features ?? []) as WorkspaceFeatureName[],
      owner: row.ownerId
        ? {
            id: row.ownerId,
            name: row.ownerName ?? '',
            email: row.ownerEmail ?? '',
            avatarUrl: row.ownerAvatarUrl,
          }
        : null,
    }));

    return { rows: mapped, total };
  }

  async adminCountWorkspaces(options: {
    keyword?: string | null;
    features?: WorkspaceFeatureName[] | null;
  }) {
    const keyword = options.keyword?.trim();
    const features = options.features ?? [];

    const [row] = await this.db.$queryRaw<{ total: bigint | number }[]>`
      WITH feature_set AS (
        SELECT workspace_id, array_agg(DISTINCT name) FILTER (WHERE activated) AS features
        FROM workspace_features
        GROUP BY workspace_id
      ),
      owner AS (
        SELECT wur.workspace_id,
               u.id   AS owner_id,
               u.email AS owner_email
        FROM workspace_user_permissions AS wur
        JOIN users u ON wur.user_id = u.id
        WHERE wur.type = ${WorkspaceRole.Owner}
        AND wur.status = ${Prisma.sql`${WorkspaceMemberStatus.Accepted}::"WorkspaceMemberStatus"`}
      )
      SELECT COUNT(*) AS total
      FROM workspaces w
      LEFT JOIN feature_set fs ON fs.workspace_id = w.id
      LEFT JOIN owner o ON o.workspace_id = w.id
      WHERE ${
        keyword
          ? Prisma.sql`
              (
                w.id ILIKE ${'%' + keyword + '%'}
                OR o.owner_id ILIKE ${'%' + keyword + '%'}
                OR o.owner_email ILIKE ${'%' + keyword + '%'}
              )
            `
          : Prisma.sql`TRUE`
      }
      AND ${
        features.length
          ? Prisma.sql`COALESCE(fs.features, ARRAY[]::text[]) @> ${features}`
          : Prisma.sql`TRUE`
      }
    `;

    return row?.total ? Number(row.total) : 0;
  }

  private buildAdminOrder(
    order?: 'createdAt' | 'snapshotSize' | 'blobCount' | 'blobSize'
  ) {
    switch (order) {
      case 'snapshotSize':
        return `"snapshotSize" DESC NULLS LAST`;
      case 'blobCount':
        return `"blobCount" DESC NULLS LAST`;
      case 'blobSize':
        return `"blobSize" DESC NULLS LAST`;
      case 'createdAt':
      default:
        return `"createdAt" DESC`;
    }
  }
  // #endregion
}
