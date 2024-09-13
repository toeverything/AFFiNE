import { DebugLogger } from '@affine/debug';

export enum WorkspaceSubPath {
  ALL = 'all',
  TRASH = 'trash',
  SHARED = 'shared',
  HOME = 'home',
}

export const WorkspaceSubPathName = {
  [WorkspaceSubPath.ALL]: 'All Pages',
  [WorkspaceSubPath.TRASH]: 'Trash',
  [WorkspaceSubPath.SHARED]: 'Shared',
  [WorkspaceSubPath.HOME]: 'Home',
} satisfies {
  [Path in WorkspaceSubPath]: string;
};

export const pathGenerator = {
  all: workspaceId => `/workspace/${workspaceId}/all`,
  trash: workspaceId => `/workspace/${workspaceId}/trash`,
  shared: workspaceId => `/workspace/${workspaceId}/shared`,
  home: workspaceId => `/workspace/${workspaceId}/home`,
} satisfies {
  [Path in WorkspaceSubPath]: (workspaceId: string) => string;
};

export const performanceLogger = new DebugLogger('performance');
export const performanceRenderLogger = performanceLogger.namespace('render');
