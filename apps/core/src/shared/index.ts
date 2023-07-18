import type {
  AffineCloudWorkspace,
  LocalWorkspace,
} from '@affine/env/workspace';
import type { AffinePublicWorkspace } from '@affine/env/workspace';
import type { WorkspaceRegistry } from '@affine/env/workspace';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';

export { BlockSuiteWorkspace };

export type AffineOfficialWorkspace =
  | AffineCloudWorkspace
  | LocalWorkspace
  | AffinePublicWorkspace;

export type AllWorkspace = WorkspaceRegistry[keyof WorkspaceRegistry];

export enum WorkspaceSubPath {
  ALL = 'all',
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
  all: workspaceId => `/workspace/${workspaceId}/all`,
  trash: workspaceId => `/workspace/${workspaceId}/trash`,
  shared: workspaceId => `/workspace/${workspaceId}/shared`,
} satisfies {
  [Path in WorkspaceSubPath]: (workspaceId: string) => string;
};
