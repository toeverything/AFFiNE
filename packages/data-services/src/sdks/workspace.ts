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
  Owner = 99,
}

export interface Workspace {
  id: string;
  type: WorkspaceType;
  public: boolean;
  permission_type: PermissionType;
  create_at: number;
}

export async function getWorkspaces(): Promise<Workspace[]> {
  return request.get('/api/workspace').json();
}

export interface WorkspaceDetail extends Workspace {
  owner: User;
  member_count: number;
}

export async function getWorkspaceDetail(
  params: GetWorkspaceDetailParams
): Promise<WorkspaceDetail | null> {
  return request.get(`/api/workspace/${params.id}`).json();
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
  return request.get(`/api/workspace/${params.id}/permission`).json();
}

export interface CreateWorkspaceParams {
  name: string;
  avatar: string;
}

export async function createWorkspace(
  params: CreateWorkspaceParams
): Promise<void> {
  return request.post('/api/workspace', { json: params }).json();
}

export interface UpdateWorkspaceParams {
  id: string;
  public: boolean;
}

export async function updateWorkspace(
  params: UpdateWorkspaceParams
): Promise<void> {
  return request
    .post(`/api/workspace/${params.id}`, {
      json: {
        public: params.public,
      },
    })
    .json();
}

export interface DeleteWorkspaceParams {
  id: string;
}

export async function deleteWorkspace(
  params: DeleteWorkspaceParams
): Promise<void> {
  await request.delete(`/api/workspace/${params.id}`);
}

export interface InviteMemberParams {
  id: string;
  email: string;
}

/**
 * Notice: Only support normal(contrast to private) workspace.
 */
export async function inviteMember(params: InviteMemberParams): Promise<void> {
  return request
    .post(`/api/workspace/${params.id}/permission`, {
      json: {
        email: params.email,
      },
    })
    .json();
}

export interface RemoveMemberParams {
  permissionId: number;
}

export async function removeMember(params: RemoveMemberParams): Promise<void> {
  await request.delete(`/api/permission/${params.permissionId}`);
}

export interface AcceptInvitingParams {
  invitingCode: string;
}

export async function acceptInviting(
  params: AcceptInvitingParams
): Promise<void> {
  await request.post(`/api/invitation/${params.invitingCode}`);
}

export interface DownloadWOrkspaceParams {
  workspaceId: string;
}
export async function downloadWorkspace(
  params: DownloadWOrkspaceParams
): Promise<ArrayBuffer> {
  return request.get(`/api/workspace/${params.workspaceId}/doc`).arrayBuffer();
}

export async function uploadBlob(params: { blob: Blob }): Promise<string> {
  return request.post('/api/blob', { body: params.blob }).text();
}

export async function getBlob(params: {
  blobId: string;
}): Promise<ArrayBuffer> {
  return request.get(`/api/blob/${params.blobId}`).arrayBuffer();
}
