// This file should has not side effect
import type { Workspace } from '@blocksuite/store';

declare global {
  interface Window {
    appInfo: {
      electron: boolean;
    };
  }
}

//#region runtime variables
export const isBrowser = typeof window !== 'undefined';
export const isServer = !isBrowser && typeof navigator === 'undefined';
export const isDesktop = isBrowser && !!window.appInfo?.electron;
//#endregion
export const DEFAULT_WORKSPACE_NAME = 'Demo Workspace';
export const UNTITLED_WORKSPACE_NAME = 'Untitled';
export const DEFAULT_HELLO_WORLD_PAGE_ID_SUFFIX = 'hello-world';

export const DEFAULT_SORT_KEY = 'updatedDate';
export const MessageCode = {
  loginError: 0,
  noPermission: 1,
  loadListFailed: 2,
  getDetailFailed: 3,
  createWorkspaceFailed: 4,
  getMembersFailed: 5,
  updateWorkspaceFailed: 6,
  deleteWorkspaceFailed: 7,
  inviteMemberFailed: 8,
  removeMemberFailed: 9,
  acceptInvitingFailed: 10,
  getBlobFailed: 11,
  leaveWorkspaceFailed: 12,
  downloadWorkspaceFailed: 13,
  refreshTokenError: 14,
  blobTooLarge: 15,
} as const;

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
  [key in (typeof MessageCode)[keyof typeof MessageCode]]: {
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
