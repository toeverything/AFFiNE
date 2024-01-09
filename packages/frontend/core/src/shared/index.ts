import { DebugLogger } from '@affine/debug';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';

export { BlockSuiteWorkspace };

export enum WorkspaceSubPath {
  ALL = 'pages',
  TRASH = 'trash',
  SHARED = 'shared',
}

export const WorkspaceSubPathName = {
  [WorkspaceSubPath.ALL]: 'All Pages',
  [WorkspaceSubPath.TRASH]: 'Trash',
  [WorkspaceSubPath.SHARED]: 'Shared',
} satisfies {
  [Path in WorkspaceSubPath]: string;
};

export const pathGenerator = {
  pages: workspaceId => `/workspace/${workspaceId}/pages`,
  trash: workspaceId => `/workspace/${workspaceId}/trash`,
  shared: workspaceId => `/workspace/${workspaceId}/shared`,
} satisfies {
  [Path in WorkspaceSubPath]: (workspaceId: string) => string;
};

export const performanceLogger = new DebugLogger('performance');
export const performanceRenderLogger = performanceLogger.namespace('render');
