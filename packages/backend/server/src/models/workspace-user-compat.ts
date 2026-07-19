import {
  Prisma,
  PrismaClient,
  User,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceMemberSource,
  WorkspaceMemberStatus,
} from '@prisma/client';
import { groupBy } from 'lodash-es';

import { WorkspaceRole, workspaceUserSelect } from './common';
import {
  workspaceRoleFromNew,
  workspaceSourceFromNew,
  workspaceStatusFromNew,
} from './permission-write';

export type WorkspaceUserCompat = {
  id: string;
  workspaceId: string;
  userId: string;
  type: WorkspaceRole;
  status: WorkspaceMemberStatus;
  source: WorkspaceMemberSource;
  inviterId: string | null;
  createdAt: Date;
  updatedAt: Date;
  user?: Pick<User, keyof typeof workspaceUserSelect>;
};

export type WorkspaceMemberWithUser = WorkspaceMember & {
  user?: Pick<User, keyof typeof workspaceUserSelect>;
};

export type WorkspaceInvitationWithUser = WorkspaceInvitation & {
  inviteeUser?: Pick<User, keyof typeof workspaceUserSelect> | null;
};

type WorkspaceUserCompatRow = {
  id: string;
  workspaceId: string;
  userId: string;
  type: number;
  status: WorkspaceMemberStatus;
  source: WorkspaceMemberSource;
  inviterId: string | null;
  createdAt: Date;
  updatedAt: Date;
  userName: string;
  userEmail: string;
  userAvatarUrl: string | null;
};

type WorkspaceUserCompatDb = Pick<
  PrismaClient,
  'workspaceMember' | 'workspaceInvitation' | '$queryRaw'
>;

export function workspaceMemberToCompat(
  member: WorkspaceMemberWithUser
): WorkspaceUserCompat {
  return {
    id: member.id,
    workspaceId: member.workspaceId,
    userId: member.userId,
    type: workspaceRoleFromNew(member.role as never),
    status: WorkspaceMemberStatus.Accepted,
    source: workspaceSourceFromNew(member.source as never),
    inviterId: null,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
    ...(member.user ? { user: member.user } : {}),
  };
}

export function workspaceInvitationToCompat(
  invitation: WorkspaceInvitationWithUser
): WorkspaceUserCompat {
  return {
    id: invitation.id,
    workspaceId: invitation.workspaceId,
    userId: invitation.inviteeUserId ?? '',
    type: workspaceRoleFromNew(invitation.requestedRole as never),
    status: workspaceStatusFromNew(invitation.status as never),
    source: workspaceSourceFromNew(invitation.kind as never),
    inviterId: invitation.inviterUserId,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
    ...(invitation.inviteeUser ? { user: invitation.inviteeUser } : {}),
  };
}

function rawCompatRowToCompat(
  row: WorkspaceUserCompatRow
): WorkspaceUserCompat {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    type: row.type,
    status: row.status,
    source: row.source,
    inviterId: row.inviterId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    user: {
      id: row.userId,
      name: row.userName,
      email: row.userEmail,
      avatarUrl: row.userAvatarUrl,
    },
  };
}

export async function queryCompatRows(
  db: WorkspaceUserCompatDb,
  workspaceId: string,
  pagination: { first: number; offset: number; after?: string | Date }
) {
  const after = pagination.after
    ? Prisma.sql`AND created_at >= ${pagination.after}::timestamptz`
    : Prisma.empty;
  const rows = await db.$queryRaw<WorkspaceUserCompatRow[]>`
    SELECT *
    FROM (
      SELECT
        wm.id AS id,
        wm.workspace_id AS "workspaceId",
        wm.user_id AS "userId",
        CASE wm.role
          WHEN 'owner' THEN ${WorkspaceRole.Owner}
          WHEN 'admin' THEN ${WorkspaceRole.Admin}
          ELSE ${WorkspaceRole.Collaborator}
        END AS type,
        'Accepted'::"WorkspaceMemberStatus" AS status,
        CASE wm.source
          WHEN 'link' THEN 'Link'::"WorkspaceMemberSource"
          ELSE 'Email'::"WorkspaceMemberSource"
        END AS source,
        NULL::varchar AS "inviterId",
        wm.created_at AS "createdAt",
        wm.updated_at AS "updatedAt",
        u.name AS "userName",
        u.email AS "userEmail",
        u.avatar_url AS "userAvatarUrl",
        wm.created_at AS created_at
      FROM workspace_members wm
      INNER JOIN users u ON u.id = wm.user_id
      WHERE wm.workspace_id = ${workspaceId}
        AND wm.state = 'active'
      UNION ALL
      SELECT
        wi.id AS id,
        wi.workspace_id AS "workspaceId",
        wi.invitee_user_id AS "userId",
        CASE wi.requested_role
          WHEN 'admin' THEN ${WorkspaceRole.Admin}
          ELSE ${WorkspaceRole.Collaborator}
        END AS type,
        CASE wi.status
          WHEN 'waiting_review' THEN 'UnderReview'::"WorkspaceMemberStatus"
          WHEN 'waiting_seat' THEN 'NeedMoreSeat'::"WorkspaceMemberStatus"
          ELSE 'Pending'::"WorkspaceMemberStatus"
        END AS status,
        CASE wi.kind
          WHEN 'link' THEN 'Link'::"WorkspaceMemberSource"
          ELSE 'Email'::"WorkspaceMemberSource"
        END AS source,
        wi.inviter_user_id AS "inviterId",
        wi.created_at AS "createdAt",
        wi.updated_at AS "updatedAt",
        u.name AS "userName",
        u.email AS "userEmail",
        u.avatar_url AS "userAvatarUrl",
        wi.created_at AS created_at
      FROM workspace_invitations wi
      INNER JOIN users u ON u.id = wi.invitee_user_id
      WHERE wi.workspace_id = ${workspaceId}
    ) roles
    WHERE true
      ${after}
    ORDER BY created_at ASC
    OFFSET ${pagination.offset}
    LIMIT ${pagination.first}
  `;
  return rows.map(row => rawCompatRowToCompat(row));
}

export async function searchCompatRows(
  db: WorkspaceUserCompatDb,
  workspaceId: string,
  query: string,
  pagination: { first: number; offset: number; after?: string | Date }
) {
  const after = pagination.after
    ? Prisma.sql`AND created_at >= ${pagination.after}::timestamptz`
    : Prisma.empty;
  const rows = await db.$queryRaw<WorkspaceUserCompatRow[]>`
    SELECT *
    FROM (
      SELECT
        wm.id AS id,
        wm.workspace_id AS "workspaceId",
        wm.user_id AS "userId",
        CASE wm.role
          WHEN 'owner' THEN ${WorkspaceRole.Owner}
          WHEN 'admin' THEN ${WorkspaceRole.Admin}
          ELSE ${WorkspaceRole.Collaborator}
        END AS type,
        'Accepted'::"WorkspaceMemberStatus" AS status,
        CASE wm.source
          WHEN 'link' THEN 'Link'::"WorkspaceMemberSource"
          ELSE 'Email'::"WorkspaceMemberSource"
        END AS source,
        NULL::varchar AS "inviterId",
        wm.created_at AS "createdAt",
        wm.updated_at AS "updatedAt",
        u.name AS "userName",
        u.email AS "userEmail",
        u.avatar_url AS "userAvatarUrl",
        wm.created_at AS created_at
      FROM workspace_members wm
      INNER JOIN users u ON u.id = wm.user_id
      WHERE wm.workspace_id = ${workspaceId}
        AND wm.state = 'active'
      UNION ALL
      SELECT
        wi.id AS id,
        wi.workspace_id AS "workspaceId",
        wi.invitee_user_id AS "userId",
        CASE wi.requested_role
          WHEN 'admin' THEN ${WorkspaceRole.Admin}
          ELSE ${WorkspaceRole.Collaborator}
        END AS type,
        CASE wi.status
          WHEN 'waiting_review' THEN 'UnderReview'::"WorkspaceMemberStatus"
          WHEN 'waiting_seat' THEN 'NeedMoreSeat'::"WorkspaceMemberStatus"
          ELSE 'Pending'::"WorkspaceMemberStatus"
        END AS status,
        CASE wi.kind
          WHEN 'link' THEN 'Link'::"WorkspaceMemberSource"
          ELSE 'Email'::"WorkspaceMemberSource"
        END AS source,
        wi.inviter_user_id AS "inviterId",
        wi.created_at AS "createdAt",
        wi.updated_at AS "updatedAt",
        u.name AS "userName",
        u.email AS "userEmail",
        u.avatar_url AS "userAvatarUrl",
        wi.created_at AS created_at
      FROM workspace_invitations wi
      INNER JOIN users u ON u.id = wi.invitee_user_id
      WHERE wi.workspace_id = ${workspaceId}
    ) roles
    WHERE ("userEmail" ILIKE ${`%${query}%`} OR "userName" ILIKE ${`%${query}%`})
      ${after}
    ORDER BY created_at ASC
    OFFSET ${pagination.offset}
    LIMIT ${pagination.first}
  `;
  return rows.map(row => rawCompatRowToCompat(row));
}

export async function countWorkspaceUsers(
  db: WorkspaceUserCompatDb,
  workspaceId: string
) {
  const [members, invitations] = await Promise.all([
    db.workspaceMember.count({
      where: { workspaceId, state: 'active' },
    }),
    db.workspaceInvitation.count({ where: { workspaceId } }),
  ]);
  return members + invitations;
}

export async function countChargedWorkspaceUsers(
  db: WorkspaceUserCompatDb,
  workspaceId: string
) {
  const [members, invitations] = await Promise.all([
    db.workspaceMember.count({
      where: { workspaceId, state: 'active' },
    }),
    db.workspaceInvitation.count({
      where: {
        workspaceId,
        status: {
          not: 'waiting_review',
        },
      },
    }),
  ]);
  return members + invitations;
}

export async function findUserActiveWorkspaceRoles(
  db: WorkspaceUserCompatDb,
  userId: string,
  filter: { role?: WorkspaceRole } = {}
) {
  const roles = await db.workspaceMember.findMany({
    where: {
      userId,
      state: 'active',
      role: filter.role ? workspaceRoleToNewFilter(filter.role) : undefined,
    },
  });
  return roles.map(role => workspaceMemberToCompat(role));
}

export async function hasSharedWorkspace(
  db: WorkspaceUserCompatDb,
  userId: string,
  otherUserId: string
) {
  if (userId === otherUserId) {
    return true;
  }

  const shared = await db.$queryRaw<{ id: string }[]>`
    SELECT mine.id
    FROM workspace_members mine
    INNER JOIN workspace_members other
      ON other.workspace_id = mine.workspace_id
     AND other.user_id = ${otherUserId}
     AND other.state = 'active'
    WHERE mine.user_id = ${userId}
      AND mine.state = 'active'
    LIMIT 1
  `;

  return shared.length > 0;
}

export async function allocateWorkspaceSeats(
  db: WorkspaceUserCompatDb,
  models: {
    workspaceMember: {
      setActive(
        workspaceId: string,
        userId: string,
        role: WorkspaceRole
      ): Promise<unknown>;
    };
  },
  workspaceId: string,
  limit: number
) {
  const [activeCount, pendingCount] = await Promise.all([
    db.workspaceMember.count({
      where: {
        workspaceId,
        state: 'active',
      },
    }),
    db.workspaceInvitation.count({
      where: {
        workspaceId,
        status: 'pending',
      },
    }),
  ]);
  const usedCount = activeCount + pendingCount;

  if (limit <= usedCount) {
    return [];
  }

  const invitationsToAllocate = await db.workspaceInvitation.findMany({
    where: {
      workspaceId,
      status: 'waiting_seat',
      inviteeUserId: {
        not: null,
      },
    },
    orderBy: { createdAt: 'asc' },
    take: limit - usedCount,
  });

  const groups = groupBy(invitationsToAllocate, invitation =>
    workspaceSourceFromNew(invitation.kind as never)
  ) as Record<WorkspaceMemberSource, WorkspaceInvitation[]>;

  if (groups.Email?.length > 0) {
    await db.workspaceInvitation.updateMany({
      where: { id: { in: groups.Email.map(invitation => invitation.id) } },
      data: { status: 'pending' },
    });
  }

  if (groups.Link?.length > 0) {
    await Promise.all(
      groups.Link.map(invitation =>
        models.workspaceMember.setActive(
          invitation.workspaceId,
          invitation.inviteeUserId as string,
          invitation.requestedRole === 'admin'
            ? WorkspaceRole.Admin
            : WorkspaceRole.Collaborator
        )
      )
    );
  }

  return (groups.Email ?? []).map(invitation =>
    workspaceInvitationToCompat({
      ...invitation,
      status: 'pending',
    })
  );
}

export function workspaceRoleToNewFilter(role: WorkspaceRole) {
  switch (role) {
    case WorkspaceRole.Owner:
      return 'owner';
    case WorkspaceRole.Admin:
      return 'admin';
    case WorkspaceRole.Collaborator:
      return 'member';
    default:
      return undefined;
  }
}
