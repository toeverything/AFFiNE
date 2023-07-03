/**
 * @deprecated Remove this file after we migrate to the new cloud.
 */
import { MessageCode, Messages } from '@affine/env/constant';
import type {
  AcceptInvitingParams,
  DeleteWorkspaceParams,
  GetUserByEmailParams,
  GetWorkspaceDetailParams,
  InviteMemberParams,
  LeaveWorkspaceParams,
  Member,
  Permission,
  RemoveMemberParams,
  UpdateWorkspaceParams,
  UsageResponse,
  User,
  Workspace,
  WorkspaceDetail,
} from '@affine/env/workspace/legacy-cloud';

import { checkLoginStorage } from '../login';

export class RequestError extends Error {
  public readonly code: (typeof MessageCode)[keyof typeof MessageCode];

  constructor(
    code: (typeof MessageCode)[keyof typeof MessageCode],
    cause: unknown | null = null
  ) {
    super(Messages[code].message);
    sendMessage(code);
    this.code = code;
    this.name = 'RequestError';
    this.cause = cause;
  }
}

function sendMessage(code: (typeof MessageCode)[keyof typeof MessageCode]) {
  document.dispatchEvent(
    new CustomEvent('affine-error', {
      detail: {
        code,
      },
    })
  );
}

export function createUserApis(prefixUrl = '/') {
  return {
    getUsage: async (): Promise<UsageResponse> => {
      const auth = await checkLoginStorage(prefixUrl);
      return fetch(prefixUrl + 'api/resource/usage', {
        method: 'GET',
        headers: {
          Authorization: auth.token,
        },
      }).then(r => r.json());
    },
    getUserByEmail: async (
      params: GetUserByEmailParams
    ): Promise<User[] | null> => {
      const auth = await checkLoginStorage(prefixUrl);
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

export function createWorkspaceApis(prefixUrl = '/') {
  return {
    getWorkspaces: async (): Promise<Workspace[]> => {
      const auth = await checkLoginStorage(prefixUrl);
      return fetch(prefixUrl + 'api/workspace', {
        method: 'GET',
        headers: {
          Authorization: auth.token,
          'Cache-Control': 'no-cache',
        },
      })
        .then(r => r.json())
        .catch(e => {
          throw new RequestError(MessageCode.loadListFailed, e);
        });
    },
    getWorkspaceDetail: async (
      params: GetWorkspaceDetailParams
    ): Promise<WorkspaceDetail | null> => {
      const auth = await checkLoginStorage(prefixUrl);
      return fetch(prefixUrl + `api/workspace/${params.id}`, {
        method: 'GET',
        headers: {
          Authorization: auth.token,
        },
      })
        .then(r => r.json())
        .catch(e => {
          throw new RequestError(MessageCode.loadListFailed, e);
        });
    },
    getWorkspaceMembers: async (
      params: GetWorkspaceDetailParams
    ): Promise<Member[]> => {
      const auth = await checkLoginStorage(prefixUrl);
      return fetch(prefixUrl + `api/workspace/${params.id}/permission`, {
        method: 'GET',
        headers: {
          Authorization: auth.token,
        },
      })
        .then(r => r.json())
        .catch(e => {
          throw new RequestError(MessageCode.getMembersFailed, e);
        });
    },
    createWorkspace: async (
      encodedYDoc: ArrayBuffer
    ): Promise<{ id: string }> => {
      const auth = await checkLoginStorage();
      return fetch(prefixUrl + 'api/workspace', {
        method: 'POST',
        body: encodedYDoc,
        headers: {
          'Content-Type': 'application/octet-stream',
          Authorization: auth.token,
        },
      })
        .then(r => r.json())
        .catch(e => {
          throw new RequestError(MessageCode.createWorkspaceFailed, e);
        });
    },
    updateWorkspace: async (
      params: UpdateWorkspaceParams
    ): Promise<{ public: boolean | null }> => {
      const auth = await checkLoginStorage(prefixUrl);
      return fetch(prefixUrl + `api/workspace/${params.id}`, {
        method: 'POST',
        body: JSON.stringify({
          public: params.public,
        }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth.token,
        },
      })
        .then(r => r.json())
        .catch(e => {
          throw new RequestError(MessageCode.updateWorkspaceFailed, e);
        });
    },
    deleteWorkspace: async (
      params: DeleteWorkspaceParams
    ): Promise<boolean> => {
      const auth = await checkLoginStorage(prefixUrl);
      return fetch(prefixUrl + `api/workspace/${params.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: auth.token,
        },
      })
        .then(r => r.ok)
        .catch(e => {
          throw new RequestError(MessageCode.deleteWorkspaceFailed, e);
        });
    },

    /**
     * Notice: Only support normal(contrast to private) workspace.
     */
    inviteMember: async (params: InviteMemberParams): Promise<void> => {
      const auth = await checkLoginStorage(prefixUrl);
      return fetch(prefixUrl + `api/workspace/${params.id}/permission`, {
        method: 'POST',
        body: JSON.stringify({
          email: params.email,
        }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth.token,
        },
      })
        .then(r => r.json())
        .catch(e => {
          throw new RequestError(MessageCode.inviteMemberFailed, e);
        });
    },
    removeMember: async (params: RemoveMemberParams): Promise<void> => {
      const auth = await checkLoginStorage(prefixUrl);
      return fetch(prefixUrl + `api/permission/${params.permissionId}`, {
        method: 'DELETE',
        headers: {
          Authorization: auth.token,
        },
      })
        .then(r => r.json())
        .catch(e => {
          throw new RequestError(MessageCode.removeMemberFailed, e);
        });
    },
    acceptInviting: async (
      params: AcceptInvitingParams
    ): Promise<Permission> => {
      return fetch(prefixUrl + `api/invitation/${params.invitingCode}`, {
        method: 'POST',
      })
        .then(r => r.json())
        .catch(e => {
          throw new RequestError(MessageCode.acceptInvitingFailed, e);
        });
    },
    uploadBlob: async (
      workspaceId: string,
      arrayBuffer: ArrayBuffer,
      type: string
    ): Promise<string> => {
      const auth = await checkLoginStorage(prefixUrl);
      const mb = arrayBuffer.byteLength / 1048576;
      if (mb > 10) {
        throw new RequestError(MessageCode.blobTooLarge);
      }
      return fetch(prefixUrl + `api/workspace/${workspaceId}/blob`, {
        method: 'PUT',
        body: arrayBuffer,
        headers: {
          'Content-Type': type,
          Authorization: auth.token,
        },
      }).then(r => r.text());
    },
    getBlob: async (
      workspaceId: string,
      blobId: string
    ): Promise<ArrayBuffer> => {
      const auth = await checkLoginStorage(prefixUrl);
      return fetch(prefixUrl + `api/workspace/${workspaceId}/blob/${blobId}`, {
        method: 'GET',
        headers: {
          Authorization: auth.token,
        },
      })
        .then(r => r.arrayBuffer())
        .catch(e => {
          throw new RequestError(MessageCode.getBlobFailed, e);
        });
    },
    leaveWorkspace: async ({ id }: LeaveWorkspaceParams) => {
      const auth = await checkLoginStorage(prefixUrl);
      return fetch(prefixUrl + `api/workspace/${id}/permission`, {
        method: 'DELETE',
        headers: {
          Authorization: auth.token,
        },
      })
        .then(r => r.json())
        .catch(e => {
          throw new RequestError(MessageCode.leaveWorkspaceFailed, e);
        });
    },
    downloadPublicWorkspacePage: async (
      workspaceId: string,
      pageId: string
    ): Promise<ArrayBuffer> => {
      return fetch(
        prefixUrl + `api/public/workspace/${workspaceId}/${pageId}`,
        {
          method: 'GET',
        }
      ).then(r =>
        r.ok
          ? r.arrayBuffer()
          : Promise.reject(new RequestError(MessageCode.noPermission))
      );
    },
    downloadWorkspace: async (
      workspaceId: string,
      published = false
    ): Promise<ArrayBuffer> => {
      if (published) {
        return fetch(prefixUrl + `api/public/workspace/${workspaceId}`, {
          method: 'GET',
        }).then(r => r.arrayBuffer());
      } else {
        const auth = await checkLoginStorage(prefixUrl);
        return fetch(prefixUrl + `api/workspace/${workspaceId}/doc`, {
          method: 'GET',
          headers: {
            Authorization: auth.token,
          },
        })
          .then(r =>
            !r.ok
              ? Promise.reject(new RequestError(MessageCode.noPermission))
              : r
          )
          .then(r => r.arrayBuffer())
          .catch(e => {
            if (e instanceof RequestError) {
              throw e;
            }
            throw new RequestError(MessageCode.downloadWorkspaceFailed, e);
          });
      }
    },
  } as const;
}
