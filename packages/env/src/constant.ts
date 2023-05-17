import type { Workspace } from '@blocksuite/store';

export const AFFINE_STORAGE_KEY = 'affine-local-storage-v2';
export const DEFAULT_WORKSPACE_NAME = 'Demo Workspace';
export const UNTITLED_WORKSPACE_NAME = 'Untitled';
export const DEFAULT_HELLO_WORLD_PAGE_ID = 'hello-world';

export const enum MessageCode {
  loginError,
  noPermission,
  loadListFailed,
  getDetailFailed,
  createWorkspaceFailed,
  getMembersFailed,
  updateWorkspaceFailed,
  deleteWorkspaceFailed,
  inviteMemberFailed,
  removeMemberFailed,
  acceptInvitingFailed,
  getBlobFailed,
  leaveWorkspaceFailed,
  downloadWorkspaceFailed,
  refreshTokenError,
  blobTooLarge,
}

export const Messages = {
  [MessageCode.loginError]: {
    message: 'Login failed',
  },
  [MessageCode.noPermission]: {
    message: 'No permission',
  },
  [MessageCode.loadListFailed]: {
    message: 'Load list failed',
  },
  [MessageCode.getDetailFailed]: {
    message: 'Get detail failed',
  },
  [MessageCode.createWorkspaceFailed]: {
    message: 'Create workspace failed',
  },
  [MessageCode.getMembersFailed]: {
    message: 'Get members failed',
  },
  [MessageCode.updateWorkspaceFailed]: {
    message: 'Update workspace failed',
  },
  [MessageCode.deleteWorkspaceFailed]: {
    message: 'Delete workspace failed',
  },
  [MessageCode.inviteMemberFailed]: {
    message: 'Invite member failed',
  },
  [MessageCode.removeMemberFailed]: {
    message: 'Remove member failed',
  },
  [MessageCode.acceptInvitingFailed]: {
    message: 'Accept inviting failed',
  },
  [MessageCode.getBlobFailed]: {
    message: 'Get blob failed',
  },
  [MessageCode.leaveWorkspaceFailed]: {
    message: 'Leave workspace failed',
  },
  [MessageCode.downloadWorkspaceFailed]: {
    message: 'Download workspace failed',
  },
  [MessageCode.refreshTokenError]: {
    message: 'Refresh token failed',
  },
  [MessageCode.blobTooLarge]: {
    message: 'Blob too large',
  },
} as const satisfies {
  [key in MessageCode]: {
    message: string;
  };
};

export class PageNotFoundError extends TypeError {
  readonly workspace: Workspace;
  readonly pageId: string;

  constructor(workspace: Workspace, pageId: string) {
    super();
    this.workspace = workspace;
    this.pageId = pageId;
  }
}

export class WorkspaceNotFoundError extends TypeError {
  readonly workspaceId: string;

  constructor(workspaceId: string) {
    super();
    this.workspaceId = workspaceId;
  }
}

export class QueryParamError extends TypeError {
  readonly targetKey: string;
  readonly query: unknown;

  constructor(targetKey: string, query: unknown) {
    super();
    this.targetKey = targetKey;
    this.query = query;
  }
}

export class Unreachable extends Error {
  constructor(message?: string) {
    super(message);
  }
}
