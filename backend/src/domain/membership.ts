import type { WorkspaceRole } from './identity.js';

export type InvitationStatus = 'Pending' | 'Accepted' | 'UnderReview';

export type InviteLinkExpireTime =
  | 'OneDay'
  | 'ThreeDays'
  | 'OneWeek'
  | 'OneMonth';

export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  email: string;
  inviteeId: string | null;
  inviterId: string;
  role: Exclude<WorkspaceRole, 'owner'>;
  status: InvitationStatus;
  createdAt: Date;
  acceptedAt: Date | null;
}

export interface WorkspaceInviteLink {
  workspaceId: string;
  token: string;
  expireAt: Date;
  createdBy: string;
  createdAt: Date;
}

export interface WorkspacePatch {
  name?: string;
  isPublic?: boolean;
  enableSharing?: boolean;
  enableUrlPreview?: boolean;
  enableAi?: boolean;
}

export const INVITE_LINK_TTL_MS: Record<InviteLinkExpireTime, number> = {
  OneDay: 24 * 60 * 60 * 1000,
  ThreeDays: 3 * 24 * 60 * 60 * 1000,
  OneWeek: 7 * 24 * 60 * 60 * 1000,
  OneMonth: 30 * 24 * 60 * 60 * 1000,
};

export function isInviteLinkExpireTime(
  value: string
): value is InviteLinkExpireTime {
  return value in INVITE_LINK_TTL_MS;
}

export type GraphQLPermission = 'Owner' | 'Admin' | 'Collaborator' | 'External';

export function roleToPermission(role: WorkspaceRole): GraphQLPermission {
  if (role === 'owner') {
    return 'Owner';
  }
  if (role === 'admin') {
    return 'Admin';
  }
  return 'Collaborator';
}

export function permissionToRole(
  permission: string
): Exclude<WorkspaceRole, 'owner'> {
  if (permission === 'Admin') {
    return 'admin';
  }
  if (permission === 'Collaborator' || permission === 'External') {
    return 'collaborator';
  }
  throw new Error(`Unsupported permission ${permission}`);
}

export function workspacePermissions(
  role: WorkspaceRole
): Record<string, boolean> {
  const member = true;
  const admin = role === 'owner' || role === 'admin';
  const owner = role === 'owner';
  return {
    Workspace_Administrators_Manage: owner,
    Workspace_Blobs_Manage: admin,
    Workspace_Blobs_Upload: member,
    Workspace_Copilot: false,
    Workspace_CreateDoc: member,
    Workspace_Delete: owner,
    Workspace_Organize_Read: member,
    Workspace_Payment_Manage: owner,
    Workspace_Preview: member,
    Workspace_Properties_Create: member,
    Workspace_Properties_Delete: admin,
    Workspace_Properties_Read: member,
    Workspace_Properties_Update: member,
    Workspace_Read: member,
    Workspace_Settings_Read: member,
    Workspace_Settings_Update: admin,
    Workspace_Sync: member,
    Workspace_TransferOwner: owner,
    Workspace_Users_Manage: admin,
    Workspace_Users_Read: member,
  };
}
