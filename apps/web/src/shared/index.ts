import type {
  AffineCloudWorkspace,
  LocalWorkspace,
} from '@affine/env/workspace';
import type { AffinePublicWorkspace } from '@affine/env/workspace';
import type { WorkspaceRegistry } from '@affine/env/workspace';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import type { NextPage } from 'next';
import type { ReactElement, ReactNode } from 'react';

export { BlockSuiteWorkspace };

export type AffineOfficialWorkspace =
  | AffineCloudWorkspace
  | LocalWorkspace
  | AffinePublicWorkspace;

export type AllWorkspace = WorkspaceRegistry[keyof WorkspaceRegistry];

export type NextPageWithLayout<P = Record<string, unknown>, IP = P> = NextPage<
  P,
  IP
> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

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

export const publicPathGenerator = {
  all: workspaceId => `/share/${workspaceId}/all`,
  trash: workspaceId => `/share/${workspaceId}/trash`,
  shared: workspaceId => `/share/${workspaceId}/shared`,
} satisfies {
  [Path in WorkspaceSubPath]: (workspaceId: string) => string;
};
