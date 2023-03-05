import { KyInstance } from 'ky/distribution/types/ky';

import { MessageCenter } from '../../../message';
import { createBlocksuiteWorkspace as _createBlocksuiteWorkspace } from '../../../utils';
import { GoogleAuth } from './google';
import RequestError from './request-error';
import type { User } from './user';
const messageCenter = MessageCenter.getInstance();

const sendMessage = messageCenter.getMessageSender('affine');

const { messageCode } = MessageCenter;

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
  Admin = 10,
  Owner = 99,
}

export interface Workspace {
  id: string;
  type: WorkspaceType;
  public: boolean;
  permission: PermissionType;
}

export interface WorkspaceDetail extends Workspace {
  owner: User;
  member_count: number;
}

export interface Permission {
  id: string;
  type: PermissionType;
  workspace_id: string;
  user_id: string;
  user_email: string;
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

export interface CreateWorkspaceParams {
  name: string;
}

export interface UpdateWorkspaceParams {
  id: string;
  public: boolean;
}

export interface DeleteWorkspaceParams {
  id: string;
}

export interface InviteMemberParams {
  id: string;
  email: string;
}

export interface RemoveMemberParams {
  permissionId: number;
}

export interface AcceptInvitingParams {
  invitingCode: string;
}

export interface LeaveWorkspaceParams {
  id: number | string;
}

export function createWorkspaceApis(
  bareClient: KyInstance,
  authClient: KyInstance,
  googleAuth: GoogleAuth
) {
  return {
    getWorkspaces: async (): Promise<Workspace[]> => {
      try {
        return await authClient
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
    },
    getWorkspaceDetail: async (
      params: GetWorkspaceDetailParams
    ): Promise<WorkspaceDetail | null> => {
      try {
        return await authClient.get(`api/workspace/${params.id}`).json();
      } catch (error) {
        sendMessage(messageCode.getDetailFailed);
        throw new RequestError('get detail failed', error);
      }
    },
    getWorkspaceMembers: async (
      params: GetWorkspaceDetailParams
    ): Promise<Member[]> => {
      try {
        return await authClient
          .get(`api/workspace/${params.id}/permission`)
          .json();
      } catch (error) {
        sendMessage(messageCode.getMembersFailed);
        throw new RequestError('get members failed', error);
      }
    },
    createWorkspace: async (encodedYDoc: Blob): Promise<{ id: string }> => {
      try {
        return await authClient
          .post('api/workspace', { body: encodedYDoc })
          .json();
      } catch (error) {
        sendMessage(messageCode.createWorkspaceFailed);
        throw new RequestError('create workspace failed', error);
      }
    },
    updateWorkspace: async (
      params: UpdateWorkspaceParams
    ): Promise<{ public: boolean | null }> => {
      try {
        return await authClient
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
    },
    deleteWorkspace: async (params: DeleteWorkspaceParams): Promise<void> => {
      try {
        await authClient.delete(`api/workspace/${params.id}`);
      } catch (error) {
        sendMessage(messageCode.deleteWorkspaceFailed);
        throw new RequestError('delete workspace failed', error);
      }
    },

    /**
     * Notice: Only support normal(contrast to private) workspace.
     */
    inviteMember: async (params: InviteMemberParams): Promise<void> => {
      try {
        await authClient.post(`api/workspace/${params.id}/permission`, {
          json: {
            email: params.email,
          },
        });
      } catch (error) {
        sendMessage(messageCode.inviteMemberFailed);
        throw new RequestError('invite member failed', error);
      }
    },
    removeMember: async (params: RemoveMemberParams): Promise<void> => {
      try {
        await authClient.delete(`api/permission/${params.permissionId}`);
      } catch (error) {
        sendMessage(messageCode.removeMemberFailed);
        throw new RequestError('remove member failed', error);
      }
    },
    acceptInviting: async (
      params: AcceptInvitingParams
    ): Promise<Permission> => {
      try {
        return await bareClient
          .post(`api/invitation/${params.invitingCode}`)
          .json();
      } catch (error) {
        sendMessage(messageCode.acceptInvitingFailed);
        throw new RequestError('accept inviting failed', error);
      }
    },
    uploadBlob: async (params: { blob: Blob }): Promise<string> => {
      return authClient.put('api/blob', { body: params.blob }).text();
    },
    getBlob: async (params: { blobId: string }): Promise<ArrayBuffer> => {
      try {
        return await authClient.get(`api/blob/${params.blobId}`).arrayBuffer();
      } catch (error) {
        sendMessage(messageCode.getBlobFailed);
        throw new RequestError('get blob failed', error);
      }
    },
    leaveWorkspace: async ({ id }: LeaveWorkspaceParams) => {
      try {
        await authClient.delete(`api/workspace/${id}/permission`);
      } catch (error) {
        sendMessage(messageCode.leaveWorkspaceFailed);
        throw new RequestError('leave workspace failed', error);
      }
    },
    downloadWorkspace: async (
      workspaceId: string,
      published = false
    ): Promise<ArrayBuffer> => {
      try {
        if (published) {
          return await bareClient
            .get(`api/public/doc/${workspaceId}`)
            .arrayBuffer();
        }
        return await authClient
          .get(`api/workspace/${workspaceId}/doc`)
          .arrayBuffer();
      } catch (error) {
        sendMessage(messageCode.downloadWorkspaceFailed);
        throw new RequestError('download workspace failed', error);
      }
    },
    createBlockSuiteWorkspaceWithAuth: async (newWorkspaceId: string) => {
      if (googleAuth.isExpired && googleAuth.isLogin) {
        await googleAuth.refreshToken();
      }
      return _createBlocksuiteWorkspace(newWorkspaceId, {
        blobOptionsGetter: (k: string) =>
          // token could be expired
          ({ api: '/api/workspace', token: googleAuth.token }[k]),
      });
    },
  } as const;
}
