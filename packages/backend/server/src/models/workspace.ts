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
  enableSharing: boolean;
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
  enableSharing: boolean;
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
  | 'enableSharing'
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

  async allowSharing(workspaceId: string) {
    const workspace = await this.get(workspaceId);
    return workspace?.enableSharing ?? true;
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
    flags?: {
      public?: boolean;
      enableAi?: boolean;
      enableSharing?: boolean;
      enableUrlPreview?: boolean;
      enableDocEmbedding?: boolean;
    };
    order?:
      | 'createdAt'
      | 'snapshotSize'
      | 'blobCount'
      | 'blobSize'
      | 'snapshotCount'
      | 'memberCount'
      | 'publicPageCount';
    includeTotal?: boolean;
  }): Promise<{ rows: AdminWorkspaceSummary[]; total: number }> {
    const keyword = options.keyword?.trim();
    const features = options.features ?? [];
    const flags = options.flags ?? {};
    const includeTotal = options.includeTotal ?? true;
    const total = includeTotal
      ? await this.adminCountWorkspaces({ keyword, features, flags })
      : 0;
    if (includeTotal && total === 0) {
      return { rows: [], total: 0 };
    }

    const featuresHaving =
      features.length > 0
        ? Prisma.sql`
            HAVING COUNT(
              DISTINCT CASE
                WHEN wf.name = ANY(${Prisma.sql`${features}::text[]`}) THEN wf.name
              END
            ) = ${features.length}
          `
        : Prisma.empty;

    const featureJoin =
      features.length > 0
        ? Prisma.sql`
            LEFT JOIN workspace_features wf
              ON wf.workspace_id = w.id AND wf.activated = TRUE
          `
        : Prisma.empty;

    const groupAndHaving =
      features.length > 0
        ? Prisma.sql`
            GROUP BY w.id,
                     w.public,
                     w.created_at,
                     w.name,
                     w.avatar_key,
                     w.enable_ai,
                     w.enable_url_preview,
                     w.enable_doc_embedding,
                     o.owner_id,
                     o.owner_name,
                     o.owner_email,
                     o.owner_avatar_url
            ${featuresHaving}
          `
        : Prisma.empty;

    const rows = await this.db.$queryRaw<RawWorkspaceSummary[]>`
      WITH filtered AS (
        SELECT w.id,
               w.public,
               w.created_at AS "createdAt",
               w.name,
               w.avatar_key AS "avatarKey",
               w.enable_ai AS "enableAi",
               w.enable_sharing AS "enableSharing",
               w.enable_url_preview AS "enableUrlPreview",
               w.enable_doc_embedding AS "enableDocEmbedding",
               o.owner_id AS "ownerId",
               o.owner_name AS "ownerName",
               o.owner_email AS "ownerEmail",
               o.owner_avatar_url AS "ownerAvatarUrl"
        FROM workspaces w
        LEFT JOIN LATERAL (
          SELECT u.id   AS owner_id,
                 u.name AS owner_name,
                 u.email AS owner_email,
                 u.avatar_url AS owner_avatar_url
          FROM workspace_user_permissions AS wur
          JOIN users u ON wur.user_id = u.id
          WHERE wur.workspace_id = w.id
          AND wur.type = ${WorkspaceRole.Owner}
          AND wur.status = ${Prisma.sql`${WorkspaceMemberStatus.Accepted}::"WorkspaceMemberStatus"`}
          ORDER BY u.created_at ASC
          LIMIT 1
        ) o ON TRUE
        ${featureJoin}
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
        ${
          this.buildAdminFlagWhere(flags).length
            ? Prisma.sql`AND ${Prisma.join(
                this.buildAdminFlagWhere(flags),
                ' AND '
              )}`
            : Prisma.empty
        }
        ${groupAndHaving}
      )
      SELECT f.*,
             COALESCE(s.snapshot_count, 0) AS "snapshotCount",
             COALESCE(s.snapshot_size, 0) AS "snapshotSize",
             COALESCE(s.blob_count, 0) AS "blobCount",
             COALESCE(s.blob_size, 0) AS "blobSize",
             COALESCE(s.member_count, 0) AS "memberCount",
             COALESCE(s.public_page_count, 0) AS "publicPageCount",
             COALESCE(s.features, ARRAY[]::text[]) AS features
      FROM filtered f
      LEFT JOIN workspace_admin_stats s ON s.workspace_id = f.id
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
      enableSharing: row.enableSharing,
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
    flags?: {
      public?: boolean;
      enableAi?: boolean;
      enableSharing?: boolean;
      enableUrlPreview?: boolean;
      enableDocEmbedding?: boolean;
    };
  }) {
    const keyword = options.keyword?.trim();
    const features = options.features ?? [];
    const flags = options.flags ?? {};

    const featuresHaving =
      features.length > 0
        ? Prisma.sql`
            HAVING COUNT(
              DISTINCT CASE
                WHEN wf.name = ANY(${Prisma.sql`${features}::text[]`}) THEN wf.name
              END
            ) = ${features.length}
          `
        : Prisma.empty;

    const featureJoin =
      features.length > 0
        ? Prisma.sql`
            LEFT JOIN workspace_features wf
              ON wf.workspace_id = w.id AND wf.activated = TRUE
          `
        : Prisma.empty;

    const groupAndHaving =
      features.length > 0
        ? Prisma.sql`
            GROUP BY w.id, o.owner_id, o.owner_email
            ${featuresHaving}
          `
        : Prisma.empty;

    const [row] = await this.db.$queryRaw<{ total: bigint | number }[]>`
      WITH filtered AS (
        SELECT w.id,
               o.owner_id AS "ownerId",
               o.owner_email AS "ownerEmail"
        FROM workspaces w
        LEFT JOIN LATERAL (
          SELECT wur.workspace_id,
                 u.id   AS owner_id,
                 u.email AS owner_email
          FROM workspace_user_permissions AS wur
          JOIN users u ON wur.user_id = u.id
          WHERE wur.workspace_id = w.id
          AND wur.type = ${WorkspaceRole.Owner}
          AND wur.status = ${Prisma.sql`${WorkspaceMemberStatus.Accepted}::"WorkspaceMemberStatus"`}
          ORDER BY u.created_at ASC
          LIMIT 1
        ) o ON TRUE
        ${featureJoin}
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
        ${
          this.buildAdminFlagWhere(flags).length
            ? Prisma.sql`AND ${Prisma.join(
                this.buildAdminFlagWhere(flags),
                ' AND '
              )}`
            : Prisma.empty
        }
        ${groupAndHaving}
      )
      SELECT COUNT(*) AS total FROM filtered
    `;

    return row?.total ? Number(row.total) : 0;
  }

  private buildAdminFlagWhere(flags: {
    public?: boolean;
    enableAi?: boolean;
    enableSharing?: boolean;
    enableUrlPreview?: boolean;
    enableDocEmbedding?: boolean;
  }) {
    const conditions: Prisma.Sql[] = [];
    if (flags.public !== undefined) {
      conditions.push(Prisma.sql`w.public = ${flags.public}`);
    }
    if (flags.enableAi !== undefined) {
      conditions.push(Prisma.sql`w.enable_ai = ${flags.enableAi}`);
    }
    if (flags.enableSharing !== undefined) {
      conditions.push(Prisma.sql`w.enable_sharing = ${flags.enableSharing}`);
    }
    if (flags.enableUrlPreview !== undefined) {
      conditions.push(
        Prisma.sql`w.enable_url_preview = ${flags.enableUrlPreview}`
      );
    }
    if (flags.enableDocEmbedding !== undefined) {
      conditions.push(
        Prisma.sql`w.enable_doc_embedding = ${flags.enableDocEmbedding}`
      );
    }
    return conditions;
  }

  private buildAdminOrder(
    order?:
      | 'createdAt'
      | 'snapshotSize'
      | 'blobCount'
      | 'blobSize'
      | 'snapshotCount'
      | 'memberCount'
      | 'publicPageCount'
  ) {
    switch (order) {
      case 'snapshotSize':
        return `"snapshotSize" DESC NULLS LAST, "createdAt" DESC`;
      case 'blobCount':
        return `"blobCount" DESC NULLS LAST, "createdAt" DESC`;
      case 'blobSize':
        return `"blobSize" DESC NULLS LAST, "createdAt" DESC`;
      case 'snapshotCount':
        return `"snapshotCount" DESC NULLS LAST, "createdAt" DESC`;
      case 'memberCount':
        return `"memberCount" DESC NULLS LAST, "createdAt" DESC`;
      case 'publicPageCount':
        return `"publicPageCount" DESC NULLS LAST, "createdAt" DESC`;
      case 'createdAt':
      default:
        return `"createdAt" DESC`;
    }
  }
  // #endregion
}
