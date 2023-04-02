import type { AffineWorkspace, LocalWorkspace } from '@affine/workspace/type';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import type { NextPage } from 'next';
import type { ReactElement, ReactNode } from 'react';

export { BlockSuiteWorkspace };

declare global {
  interface Window {
    CLIENT_APP?: boolean;
  }
}

export type AffineOfficialWorkspace = AffineWorkspace | LocalWorkspace;

export type AllWorkspace = AffineOfficialWorkspace;

export type NextPageWithLayout<P = Record<string, unknown>, IP = P> = NextPage<
  P,
  IP
> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

export const enum WorkspaceSubPath {
  ALL = 'all',
  FAVORITE = 'favorite',
  SETTING = 'setting',
  TRASH = 'trash',
}

export const WorkspaceSubPathName = {
  [WorkspaceSubPath.ALL]: 'All Pages',
  [WorkspaceSubPath.FAVORITE]: 'Favorites',
  [WorkspaceSubPath.SETTING]: 'Settings',
  [WorkspaceSubPath.TRASH]: 'Trash',
} satisfies {
  [Path in WorkspaceSubPath]: string;
};

export const pathGenerator = {
  all: workspaceId => `/workspace/${workspaceId}/all`,
  favorite: workspaceId => `/workspace/${workspaceId}/favorite`,
  trash: workspaceId => `/workspace/${workspaceId}/trash`,
  setting: workspaceId => `/workspace/${workspaceId}/setting`,
} satisfies {
  [Path in WorkspaceSubPath]: (workspaceId: string) => string;
};

export const publicPathGenerator = {
  all: workspaceId => `/public-workspace/${workspaceId}/all`,
  favorite: workspaceId => `/public-workspace/${workspaceId}/favorite`,
  trash: workspaceId => `/public-workspace/${workspaceId}/trash`,
  setting: workspaceId => `/public-workspace/${workspaceId}/setting`,
} satisfies {
  [Path in WorkspaceSubPath]: (workspaceId: string) => string;
};
