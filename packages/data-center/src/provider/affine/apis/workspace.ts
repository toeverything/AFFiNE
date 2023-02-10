import { MessageCenter } from '../../../message/index.js';
import { bareClient, client } from './request.js';
import type { User } from './user';

const messageCenter = MessageCenter.getInstance();

const sendMessage = messageCenter.getMessageSender('affine');

const { messageCode } = MessageCenter;

class RequestError extends Error {
  constructor(message: string, cause: unknown | null = null) {
    super(message);
    this.name = 'RequestError';
    this.cause = cause;
  }
}
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
  try {
    return await client
      .get('api/workspace', {
        headers: {
          'Cache-Control': 'no-cache',
        },
      })
      .json();
  } catch (error) {
    sendMessage(messageCode.loadListFailed);
    throw new RequestError('load list failed', error);
  }
}

export interface WorkspaceDetail extends Workspace {
  owner: User;
  member_count: number;
}

export async function getWorkspaceDetail(
  params: GetWorkspaceDetailParams
): Promise<WorkspaceDetail | null> {
  try {
    return await client.get(`api/workspace/${params.id}`).json();
  } catch (error) {
    sendMessage(messageCode.getDetailFailed);
    throw new RequestError('get detail failed', error);
  }
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
  try {
    return await client.get(`api/workspace/${params.id}/permission`).json();
  } catch (error) {
    sendMessage(messageCode.getMembersFailed);
    throw new RequestError('get members failed', error);
  }
}

export interface CreateWorkspaceParams {
  name: string;
}

export async function createWorkspace(
  encodedYDoc: Blob
): Promise<{ id: string }> {
  try {
    return await client.post('api/workspace', { body: encodedYDoc }).json();
  } catch (error) {
    sendMessage(messageCode.createWorkspaceFailed);
    throw new RequestError('create workspace failed', error);
  }
}

export interface UpdateWorkspaceParams {
  id: string;
  public: boolean;
}

export async function updateWorkspace(
  params: UpdateWorkspaceParams
): Promise<{ public: boolean | null }> {
  try {
    return await client
      .post(`api/workspace/${params.id}`, {
        json: {
          public: params.public,
        },
      })
      .json();
  } catch (error) {
    sendMessage(messageCode.updateWorkspaceFailed);
    throw new RequestError('update workspace failed', error);
  }
}

export interface DeleteWorkspaceParams {
  id: string;
}

export async function deleteWorkspace(
  params: DeleteWorkspaceParams
): Promise<void> {
  try {
    await client.delete(`api/workspace/${params.id}`);
  } catch (error) {
    sendMessage(messageCode.deleteWorkspaceFailed);
    throw new RequestError('delete workspace failed', error);
  }
}

export interface InviteMemberParams {
  id: string;
  email: string;
}

/**
 * Notice: Only support normal(contrast to private) workspace.
 */
export async function inviteMember(params: InviteMemberParams): Promise<void> {
  try {
    await client.post(`api/workspace/${params.id}/permission`, {
      json: {
        email: params.email,
      },
    });
  } catch (error) {
    sendMessage(messageCode.inviteMemberFailed);
    throw new RequestError('invite member failed', error);
  }
}

export interface RemoveMemberParams {
  permissionId: number;
}

export async function removeMember(params: RemoveMemberParams): Promise<void> {
  try {
    await client.delete(`api/permission/${params.permissionId}`);
  } catch (error) {
    sendMessage(messageCode.removeMemberFailed);
    throw new RequestError('remove member failed', error);
  }
}

export interface AcceptInvitingParams {
  invitingCode: string;
}

export async function acceptInviting(
  params: AcceptInvitingParams
): Promise<Permission> {
  try {
    return await bareClient
      .post(`api/invitation/${params.invitingCode}`)
      .json();
  } catch (error) {
    sendMessage(messageCode.acceptInvitingFailed);
    throw new RequestError('accept inviting failed', error);
  }
}

export async function uploadBlob(params: { blob: Blob }): Promise<string> {
  return client.put('api/blob', { body: params.blob }).text();
}

export async function getBlob(params: {
  blobId: string;
}): Promise<ArrayBuffer> {
  try {
    return await client.get(`api/blob/${params.blobId}`).arrayBuffer();
  } catch (error) {
    sendMessage(messageCode.getBlobFailed);
    throw new RequestError('get blob failed', error);
  }
}

export interface LeaveWorkspaceParams {
  id: number | string;
}

export async function leaveWorkspace({ id }: LeaveWorkspaceParams) {
  try {
    await client.delete(`api/workspace/${id}/permission`);
  } catch (error) {
    sendMessage(messageCode.leaveWorkspaceFailed);
    throw new RequestError('leave workspace failed', error);
  }
}

export async function downloadWorkspace(
  workspaceId: string,
  published = false
): Promise<ArrayBuffer> {
  try {
    if (published) {
      return await bareClient
        .get(`api/public/doc/${workspaceId}`)
        .arrayBuffer();
    }
    return await client.get(`api/workspace/${workspaceId}/doc`).arrayBuffer();
  } catch (error) {
    sendMessage(messageCode.downloadWorkspaceFailed);
    throw new RequestError('download workspace failed', error);
  }
}
