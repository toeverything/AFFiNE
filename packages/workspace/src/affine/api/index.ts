import { assertExists } from '@blocksuite/global/utils';
import { z } from 'zod';

import { getLoginStorage } from '../login';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url: string;
  create_at: string;
}

export interface GetUserByEmailParams {
  email: string;
  workspace_id: string;
}

export function createUserApis(prefixUrl = '/') {
  return {
    getUserByEmail: async (
      params: GetUserByEmailParams
    ): Promise<User[] | null> => {
      const auth = getLoginStorage();
      assertExists(auth);
      const target = new URL(prefixUrl + 'api/user', window.location.origin);
      target.searchParams.append('email', params.email);
      target.searchParams.append('workspace_id', params.workspace_id);
      return fetch(target, {
        method: 'GET',
        headers: {
          Authorization: auth.token,
        },
      }).then(r => r.json());
    },
  } as const;
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

export const createWorkspaceResponseSchema = z.object({
  id: z.string(),
  public: z.boolean(),
  type: z.nativeEnum(WorkspaceType),
  created_at: z.number(),
});

export function createWorkspaceApis(prefixUrl = '/') {
  return {
    getWorkspaces: async (): Promise<Workspace[]> => {
      const auth = getLoginStorage();
      assertExists(auth);
      return fetch(prefixUrl + 'api/workspace', {
        method: 'GET',
        headers: {
          Authorization: auth.token,
          'Cache-Control': 'no-cache',
        },
      }).then(r => r.json());
    },
    getWorkspaceDetail: async (
      params: GetWorkspaceDetailParams
    ): Promise<WorkspaceDetail | null> => {
      const auth = getLoginStorage();
      assertExists(auth);
      return fetch(prefixUrl + `api/workspace/${params.id}`, {
        method: 'GET',
        headers: {
          Authorization: auth.token,
        },
      }).then(r => r.json());
    },
    getWorkspaceMembers: async (
      params: GetWorkspaceDetailParams
    ): Promise<Member[]> => {
      const auth = getLoginStorage();
      assertExists(auth);
      return fetch(prefixUrl + `api/workspace/${params.id}/permission`, {
        method: 'GET',
        headers: {
          Authorization: auth.token,
        },
      }).then(r => r.json());
    },
    createWorkspace: async (encodedYDoc: Blob): Promise<{ id: string }> => {
      const auth = getLoginStorage();
      assertExists(auth);
      return fetch(prefixUrl + 'api/workspace', {
        method: 'POST',
        body: encodedYDoc,
        headers: {
          Authorization: auth.token,
        },
      }).then(r => r.json());
    },
    updateWorkspace: async (
      params: UpdateWorkspaceParams
    ): Promise<{ public: boolean | null }> => {
      const auth = getLoginStorage();
      assertExists(auth);
      return fetch(prefixUrl + `api/workspace/${params.id}`, {
        method: 'POST',
        body: JSON.stringify({
          public: params.public,
        }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth.token,
        },
      }).then(r => r.json());
    },
    deleteWorkspace: async (
      params: DeleteWorkspaceParams
    ): Promise<boolean> => {
      const auth = getLoginStorage();
      assertExists(auth);
      return fetch(prefixUrl + `api/workspace/${params.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: auth.token,
        },
      }).then(r => r.ok);
    },

    /**
     * Notice: Only support normal(contrast to private) workspace.
     */
    inviteMember: async (params: InviteMemberParams): Promise<void> => {
      const auth = getLoginStorage();
      assertExists(auth);
      return fetch(prefixUrl + `api/workspace/${params.id}/permission`, {
        method: 'POST',
        body: JSON.stringify({
          email: params.email,
        }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth.token,
        },
      }).then(r => r.json());
    },
    removeMember: async (params: RemoveMemberParams): Promise<void> => {
      const auth = getLoginStorage();
      assertExists(auth);
      return fetch(prefixUrl + `api/permission/${params.permissionId}`, {
        method: 'DELETE',
        headers: {
          Authorization: auth.token,
        },
      }).then(r => r.json());
    },
    acceptInviting: async (
      params: AcceptInvitingParams
    ): Promise<Permission> => {
      return fetch(prefixUrl + `api/invitation/${params.invitingCode}`, {
        method: 'POST',
      }).then(r => r.json());
    },
    uploadBlob: async (params: { blob: Blob }): Promise<string> => {
      const auth = getLoginStorage();
      assertExists(auth);
      return fetch(prefixUrl + 'api/blob', {
        method: 'PUT',
        body: params.blob,
        headers: {
          Authorization: auth.token,
        },
      }).then(r => r.text());
    },
    getBlob: async (params: { blobId: string }): Promise<ArrayBuffer> => {
      const auth = getLoginStorage();
      assertExists(auth);
      return fetch(prefixUrl + `api/blob/${params.blobId}`, {
        method: 'GET',
        headers: {
          Authorization: auth.token,
        },
      }).then(r => r.arrayBuffer());
    },
    leaveWorkspace: async ({ id }: LeaveWorkspaceParams) => {
      const auth = getLoginStorage();
      assertExists(auth);
      return fetch(prefixUrl + `api/workspace/${id}/permission`, {
        method: 'DELETE',
        headers: {
          Authorization: auth.token,
        },
      }).then(r => r.json());
    },
    downloadWorkspace: async (
      workspaceId: string,
      published = false
    ): Promise<ArrayBuffer> => {
      if (published) {
        return fetch(prefixUrl + `api/public/doc/${workspaceId}`, {
          method: 'GET',
        }).then(r => r.arrayBuffer());
      } else {
        const auth = getLoginStorage();
        assertExists(auth);
        return fetch(prefixUrl + `api/workspace/${workspaceId}/doc`, {
          method: 'GET',
          headers: {
            Authorization: auth.token,
          },
        }).then(r => r.arrayBuffer());
      }
    },
  } as const;
}
