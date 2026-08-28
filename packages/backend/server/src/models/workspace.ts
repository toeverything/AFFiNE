import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { Prisma, type Workspace as WorkspaceRecord } from '@prisma/client';

import { EventBus } from '../base';
import { BaseModel } from './base';

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

export type Workspace = WorkspaceRecord & {
  public: boolean;
  enableSharing: boolean;
  enableUrlPreview: boolean;
};
export type UpdateWorkspaceInput = Pick<
  Partial<WorkspaceRecord>,
  | 'enableAi'
  | 'enableDocEmbedding'
  | 'name'
  | 'avatarKey'
  | 'indexed'
  | 'lastCheckEmbeddings'
> & {
  public?: boolean;
  enableSharing?: boolean;
  enableUrlPreview?: boolean;
};

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
      data: {
        accessPolicy: {
          create: {
            visibility: 'private',
            sharingEnabled: true,
            urlPreviewEnabled: false,
          },
        },
      },
      include: { accessPolicy: true },
    });
    this.logger.log(`Workspace created with id ${workspace.id}`);
    await this.models.workspaceUser.setOwner(workspace.id, userId);
    return this.withAccessPolicy(workspace);
  }

  /**
   * Update the workspace with the given data.
   */
  @Transactional()
  async update(
    workspaceId: string,
    data: UpdateWorkspaceInput,
    notifyUpdate = true
  ) {
    const {
      public: isPublic,
      enableSharing,
      enableUrlPreview,
      ...workspaceData
    } = data;
    if (
      isPublic !== undefined ||
      enableSharing !== undefined ||
      enableUrlPreview !== undefined
    ) {
      await this.models.workspaceAccessPolicy.upsert(workspaceId, {
        public: isPublic,
        enableSharing,
        enableUrlPreview,
      });
    }

    await this.db.workspace.update({
      where: {
        id: workspaceId,
      },
      data: workspaceData,
    });
    const workspace = await this.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found after update`);
    }
    this.logger.debug(
      `Updated workspace ${workspaceId} with data ${JSON.stringify(data)}`
    );

    if (notifyUpdate) {
      this.event.emit('workspace.updated', workspace);
    }

    return workspace;
  }

  async get(workspaceId: string) {
    const workspace = await this.db.workspace.findUnique({
      where: {
        id: workspaceId,
      },
      include: { accessPolicy: true },
    });
    return workspace ? this.withAccessPolicy(workspace) : null;
  }

  async findMany(ids: string[]) {
    const workspaces = await this.db.workspace.findMany({
      where: {
        id: { in: ids },
      },
      include: { accessPolicy: true },
    });
    return workspaces.map(workspace => this.withAccessPolicy(workspace));
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

  @Transactional()
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
    const policy = await this.db.workspaceAccessPolicy.findUnique({
      where: { workspaceId },
      select: { urlPreviewEnabled: true },
    });
    return policy?.urlPreviewEnabled ?? false;
  }

  async allowSharing(workspaceId: string) {
    const policy = await this.db.workspaceAccessPolicy.findUnique({
      where: { workspaceId },
      select: { sharingEnabled: true },
    });
    return policy?.sharingEnabled ?? true;
  }

  async allowEmbedding(workspaceId: string) {
    const workspace = await this.get(workspaceId);
    return workspace?.enableDocEmbedding ?? false;
  }

  async isTeamWorkspace(workspaceId: string) {
    const now = new Date();
    const count = await this.db.entitlement.count({
      where: {
        targetType: 'workspace',
        targetId: workspaceId,
        plan: { in: ['team', 'selfhost_team'] },
        OR: [
          {
            status: 'active',
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          { status: 'grace', graceUntil: { gt: now } },
        ],
      },
    });

    return count > 0;
  }

  private withAccessPolicy(
    workspace: Prisma.WorkspaceGetPayload<{
      include: { accessPolicy: true };
    }>
  ): Workspace {
    const { accessPolicy, ...data } = workspace;
    return {
      ...data,
      public: accessPolicy?.visibility === 'public',
      enableSharing: accessPolicy?.sharingEnabled ?? true,
      enableUrlPreview: accessPolicy?.urlPreviewEnabled ?? false,
    };
  }
  // #endregion

  // #region admin
  async adminListWorkspaces(options: {
    skip: number;
    first: number;
    keyword?: string | null;
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
    const flags = options.flags ?? {};
    const includeTotal = options.includeTotal ?? true;
    const total = includeTotal
      ? await this.adminCountWorkspaces({ keyword, flags })
      : 0;
    if (includeTotal && total === 0) {
      return { rows: [], total: 0 };
    }

    if (!keyword) {
      const rows = await this.db.$queryRaw<RawWorkspaceSummary[]>`
        WITH filtered AS (
          SELECT w.id,
                 (wap.visibility = 'public') AS public,
                 w.created_at AS "createdAt",
                 w.name,
                 w.avatar_key AS "avatarKey",
                 w.enable_ai AS "enableAi",
                 wap.sharing_enabled AS "enableSharing",
                 wap.url_preview_enabled AS "enableUrlPreview",
                 w.enable_doc_embedding AS "enableDocEmbedding"
          FROM workspaces w
          JOIN workspace_access_policies wap ON wap.workspace_id = w.id
          WHERE ${
            this.buildAdminFlagWhere(flags).length
              ? Prisma.join(this.buildAdminFlagWhere(flags), ' AND ')
              : Prisma.sql`TRUE`
          }
        ),
        page AS (
          SELECT f.*,
                 COALESCE(s.snapshot_count, 0) AS "snapshotCount",
                 COALESCE(s.snapshot_size, 0) AS "snapshotSize",
                 COALESCE(s.blob_count, 0) AS "blobCount",
                 COALESCE(s.blob_size, 0) AS "blobSize",
                 COALESCE(s.member_count, 0) AS "memberCount",
                 COALESCE(s.public_page_count, 0) AS "publicPageCount"
          FROM filtered f
          LEFT JOIN workspace_admin_stats s ON s.workspace_id = f.id
          ORDER BY ${Prisma.raw(this.buildAdminOrder(options.order))}
          LIMIT ${options.first}
          OFFSET ${options.skip}
        )
        SELECT p.*,
               o.owner_id AS "ownerId",
               o.owner_name AS "ownerName",
               o.owner_email AS "ownerEmail",
               o.owner_avatar_url AS "ownerAvatarUrl"
        FROM page p
        LEFT JOIN LATERAL (
          SELECT u.id   AS owner_id,
                 u.name AS owner_name,
                 u.email AS owner_email,
                 u.avatar_url AS owner_avatar_url
          FROM workspace_members AS wm
          JOIN users u ON wm.user_id = u.id
          WHERE wm.workspace_id = p.id
          AND wm.role = 'owner'
          AND wm.state = 'active'
          ORDER BY u.created_at ASC, wm.id ASC
          LIMIT 1
        ) o ON TRUE
        ORDER BY ${Prisma.raw(this.buildAdminOrder(options.order))}
      `;

      return { rows: this.mapAdminWorkspaceRows(rows), total };
    }

    const rows = await this.db.$queryRaw<RawWorkspaceSummary[]>`
      WITH filtered AS (
        SELECT w.id,
               (wap.visibility = 'public') AS public,
               w.created_at AS "createdAt",
               w.name,
               w.avatar_key AS "avatarKey",
               w.enable_ai AS "enableAi",
               wap.sharing_enabled AS "enableSharing",
               wap.url_preview_enabled AS "enableUrlPreview",
               w.enable_doc_embedding AS "enableDocEmbedding",
               o.owner_id AS "ownerId",
               o.owner_name AS "ownerName",
               o.owner_email AS "ownerEmail",
               o.owner_avatar_url AS "ownerAvatarUrl"
        FROM workspaces w
        JOIN workspace_access_policies wap ON wap.workspace_id = w.id
        LEFT JOIN LATERAL (
          SELECT u.id   AS owner_id,
                 u.name AS owner_name,
                 u.email AS owner_email,
                 u.avatar_url AS owner_avatar_url
          FROM workspace_members AS wm
          JOIN users u ON wm.user_id = u.id
          WHERE wm.workspace_id = w.id
          AND wm.role = 'owner'
          AND wm.state = 'active'
          ORDER BY u.created_at ASC, wm.id ASC
          LIMIT 1
        ) o ON TRUE
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
      )
      SELECT f.*,
             COALESCE(s.snapshot_count, 0) AS "snapshotCount",
             COALESCE(s.snapshot_size, 0) AS "snapshotSize",
             COALESCE(s.blob_count, 0) AS "blobCount",
             COALESCE(s.blob_size, 0) AS "blobSize",
             COALESCE(s.member_count, 0) AS "memberCount",
             COALESCE(s.public_page_count, 0) AS "publicPageCount"
      FROM filtered f
      LEFT JOIN workspace_admin_stats s ON s.workspace_id = f.id
      ORDER BY ${Prisma.raw(this.buildAdminOrder(options.order))}
      LIMIT ${options.first}
      OFFSET ${options.skip}
    `;

    return { rows: this.mapAdminWorkspaceRows(rows), total };
  }

  private mapAdminWorkspaceRows(rows: RawWorkspaceSummary[]) {
    return rows.map(row => ({
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
      owner: row.ownerId
        ? {
            id: row.ownerId,
            name: row.ownerName ?? '',
            email: row.ownerEmail ?? '',
            avatarUrl: row.ownerAvatarUrl,
          }
        : null,
    }));
  }

  async adminGetWorkspace(id: string) {
    const rows = await this.db.$queryRaw<RawWorkspaceSummary[]>`
      SELECT w.id,
             (wap.visibility = 'public') AS public,
             w.created_at AS "createdAt",
             w.name,
             w.avatar_key AS "avatarKey",
             w.enable_ai AS "enableAi",
             wap.sharing_enabled AS "enableSharing",
             wap.url_preview_enabled AS "enableUrlPreview",
             w.enable_doc_embedding AS "enableDocEmbedding",
             o.owner_id AS "ownerId",
             o.owner_name AS "ownerName",
             o.owner_email AS "ownerEmail",
             o.owner_avatar_url AS "ownerAvatarUrl",
             COALESCE(s.snapshot_count, 0) AS "snapshotCount",
             COALESCE(s.snapshot_size, 0) AS "snapshotSize",
             COALESCE(s.blob_count, 0) AS "blobCount",
             COALESCE(s.blob_size, 0) AS "blobSize",
             COALESCE(s.member_count, 0) AS "memberCount",
             COALESCE(s.public_page_count, 0) AS "publicPageCount"
      FROM workspaces w
      JOIN workspace_access_policies wap ON wap.workspace_id = w.id
      LEFT JOIN LATERAL (
        SELECT u.id   AS owner_id,
               u.name AS owner_name,
               u.email AS owner_email,
               u.avatar_url AS owner_avatar_url
        FROM workspace_members AS wm
        JOIN users u ON wm.user_id = u.id
        WHERE wm.workspace_id = w.id
        AND wm.role = 'owner'
        AND wm.state = 'active'
        ORDER BY u.created_at ASC, wm.id ASC
        LIMIT 1
      ) o ON TRUE
      LEFT JOIN workspace_admin_stats s ON s.workspace_id = w.id
      WHERE w.id = ${id}
      LIMIT 1
    `;

    return this.mapAdminWorkspaceRows(rows)[0] ?? null;
  }

  async adminCountWorkspaces(options: {
    keyword?: string | null;
    flags?: {
      public?: boolean;
      enableAi?: boolean;
      enableSharing?: boolean;
      enableUrlPreview?: boolean;
      enableDocEmbedding?: boolean;
    };
  }) {
    const keyword = options.keyword?.trim();
    const flags = options.flags ?? {};

    if (!keyword) {
      const [row] = await this.db.$queryRaw<{ total: bigint | number }[]>`
        SELECT COUNT(*) AS total
        FROM workspaces w
        JOIN workspace_access_policies wap ON wap.workspace_id = w.id
        WHERE ${
          this.buildAdminFlagWhere(flags).length
            ? Prisma.join(this.buildAdminFlagWhere(flags), ' AND ')
            : Prisma.sql`TRUE`
        }
      `;

      return row?.total ? Number(row.total) : 0;
    }

    const [row] = await this.db.$queryRaw<{ total: bigint | number }[]>`
      WITH filtered AS (
        SELECT w.id,
               o.owner_id AS "ownerId",
               o.owner_email AS "ownerEmail"
        FROM workspaces w
        JOIN workspace_access_policies wap ON wap.workspace_id = w.id
        LEFT JOIN LATERAL (
          SELECT wm.workspace_id,
                 u.id   AS owner_id,
                 u.email AS owner_email
          FROM workspace_members AS wm
          JOIN users u ON wm.user_id = u.id
          WHERE wm.workspace_id = w.id
          AND wm.role = 'owner'
          AND wm.state = 'active'
          ORDER BY u.created_at ASC, wm.id ASC
          LIMIT 1
        ) o ON TRUE
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
      conditions.push(
        Prisma.sql`(wap.visibility = 'public') = ${flags.public}`
      );
    }
    if (flags.enableAi !== undefined) {
      conditions.push(Prisma.sql`w.enable_ai = ${flags.enableAi}`);
    }
    if (flags.enableSharing !== undefined) {
      conditions.push(Prisma.sql`wap.sharing_enabled = ${flags.enableSharing}`);
    }
    if (flags.enableUrlPreview !== undefined) {
      conditions.push(
        Prisma.sql`wap.url_preview_enabled = ${flags.enableUrlPreview}`
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
        return `"snapshotSize" DESC NULLS LAST, "createdAt" DESC, "id" ASC`;
      case 'blobCount':
        return `"blobCount" DESC NULLS LAST, "createdAt" DESC, "id" ASC`;
      case 'blobSize':
        return `"blobSize" DESC NULLS LAST, "createdAt" DESC, "id" ASC`;
      case 'snapshotCount':
        return `"snapshotCount" DESC NULLS LAST, "createdAt" DESC, "id" ASC`;
      case 'memberCount':
        return `"memberCount" DESC NULLS LAST, "createdAt" DESC, "id" ASC`;
      case 'publicPageCount':
        return `"publicPageCount" DESC NULLS LAST, "createdAt" DESC, "id" ASC`;
      case 'createdAt':
      default:
        return `"createdAt" DESC, "id" ASC`;
    }
  }
  // #endregion
}
