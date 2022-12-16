import { request } from '../request';
import { User } from './user';

export interface GetWorkspaceDetailParams {
  id: string;
}

export enum WorkspaceType {
  Private = 0,
  Normal = 1,
}

export enum PermissionType {
  Read = 0,
  Write = 1,
  Admin = 2,
  Owner = 3,
}

export interface Workspace {
  id: string;
  type: WorkspaceType;
  public: boolean;
  permission_type: PermissionType;
  create_at: number;
}

export async function getWorkspaces(): Promise<Workspace[]> {
  const data = await request({
    url: '/api/workspace',
    method: 'GET',
  });

  return data.data;
}

export interface WorkspaceDetail extends Workspace {
  owner: User;
  member_count: number;
}

export async function getWorkspaceDetail(
  params: GetWorkspaceDetailParams
): Promise<WorkspaceDetail | null> {
  const data = await request<WorkspaceDetail | null>({
    url: `/api/workspace/${params.id}`,
    method: 'PUT',
  });

  return data.data;
}

export interface Permission {
  id: number;
  type: PermissionType;
  workspace_id: string;
  accepted: boolean;
  create_at: number;
}

export interface RegisteredUser extends User {
  type: 'Registered';
}

export interface UnregisteredUser {
  type: 'Unregistered';
  email: string;
}

export interface Member extends Permission {
  user: RegisteredUser | UnregisteredUser;
}

export interface GetWorkspaceMembersParams {
  id: string;
}

export async function getWorkspaceMembers(
  params: GetWorkspaceDetailParams
): Promise<Member[]> {
  const data = await request<Member[]>({
    url: `/api/workspace/${params.id}/permission`,
    method: 'GET',
  });

  return data.data;
}

export interface CreateWorkspaceParams {
  name: string;
  avatar: string;
}

export async function createWorkspace(
  params: CreateWorkspaceParams
): Promise<void> {
  const data = await request({
    url: '/api/workspace',
    method: 'POST',
    data: params,
  });

  return data.data;
}

export interface UpdateWorkspaceParams {
  id: string;
  public: boolean;
}

export async function updateWorkspace(
  params: UpdateWorkspaceParams
): Promise<void> {
  const data = await request({
    url: `/api/workspace/${params.id}`,
    method: 'POST',
    data: {
      public: params.public,
    },
  });

  return data.data;
}

export interface DeleteWorkspaceParams {
  id: string;
}

export async function deleteWorkspace(
  params: DeleteWorkspaceParams
): Promise<void> {
  const data = await request({
    url: `/api/workspace/${params.id}`,
    method: 'DELETE',
  });

  return data.data;
}

export interface InviteMemberParams {
  id: string;
  email: string;
}

/**
 * Notice: Only support normal(contrast to private) workspace.
 */
export async function inviteMember(params: InviteMemberParams): Promise<void> {
  const data = await request({
    url: `/api/workspace/${params.id}/permission`,
    method: 'POST',
    data: {
      email: params.email,
    },
  });

  return data.data;
}

export interface RemoveMemberParams {
  permissionId: number;
}

export async function removeMember(params: RemoveMemberParams): Promise<void> {
  const data = await request({
    url: `/api/permission/${params.permissionId}`,
    method: 'DELETE',
  });

  return data.data;
}

export interface AcceptInvitingParams {
  invitingCode: string;
}

export async function acceptInviting(
  params: AcceptInvitingParams
): Promise<void> {
  const data = await request({
    url: `/api/invite/${params.invitingCode}`,
    method: 'POST',
  });

  return data.data;
}
