import type {
  AffineLegacyCloudWorkspace,
  LocalWorkspace,
} from '@affine/workspace/type';
import type { AffinePublicWorkspace } from '@affine/workspace/type';
import type { WorkspaceRegistry } from '@affine/workspace/type';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import type { NextPage } from 'next';
import type { ReactElement, ReactNode } from 'react';

export { BlockSuiteWorkspace };

export type AffineOfficialWorkspace =
  | AffineLegacyCloudWorkspace
  | LocalWorkspace
  | AffinePublicWorkspace;

export type AllWorkspace = WorkspaceRegistry[keyof WorkspaceRegistry];

export type NextPageWithLayout<P = Record<string, unknown>, IP = P> = NextPage<
  P,
  IP
> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

export const enum WorkspaceSubPath {
  ALL = 'all',
  SETTING = 'setting',
  TRASH = 'trash',
  SHARED = 'shared',
}

export const WorkspaceSubPathName = {
  [WorkspaceSubPath.ALL]: 'All Pages',
  [WorkspaceSubPath.SETTING]: 'Settings',
  [WorkspaceSubPath.TRASH]: 'Trash',
  [WorkspaceSubPath.SHARED]: 'Shared',
} satisfies {
  [Path in WorkspaceSubPath]: string;
};

export const pathGenerator = {
  all: workspaceId => `/workspace/${workspaceId}/all`,
  trash: workspaceId => `/workspace/${workspaceId}/trash`,
  setting: workspaceId => `/workspace/${workspaceId}/setting`,
  shared: workspaceId => `/workspace/${workspaceId}/shared`,
} satisfies {
  [Path in WorkspaceSubPath]: (workspaceId: string) => string;
};

export const publicPathGenerator = {
  all: workspaceId => `/public-workspace/${workspaceId}/all`,
  trash: workspaceId => `/public-workspace/${workspaceId}/trash`,
  setting: workspaceId => `/public-workspace/${workspaceId}/setting`,
  shared: workspaceId => `/public-workspace/${workspaceId}/shared`,
} satisfies {
  [Path in WorkspaceSubPath]: (workspaceId: string) => string;
};
