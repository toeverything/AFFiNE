import type { Workspace as RemoteWorkspace } from '@affine/datacenter';
import type { WorkspaceFlavour } from '@affine/workspace/type';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import type { NextPage } from 'next';
import type { ReactElement, ReactNode } from 'react';

export { BlockSuiteWorkspace };

declare global {
  interface Window {
    CLIENT_APP?: boolean;
  }
}

export interface AffineWorkspace extends RemoteWorkspace {
  flavour: WorkspaceFlavour.AFFINE;
  // empty
  blockSuiteWorkspace: BlockSuiteWorkspace;
  providers: Provider[];
}

export interface LocalWorkspace {
  flavour: WorkspaceFlavour.LOCAL;
  id: string;
  blockSuiteWorkspace: BlockSuiteWorkspace;
  providers: Provider[];
}

export type BaseProvider = {
  flavour: string;
  // if this is true, we will connect the provider on the background
  background: boolean;
  connect: () => void;
  disconnect: () => void;
  // cleanup data when workspace is removed
  cleanup: () => void;
};

export interface BackgroundProvider extends BaseProvider {
  background: true;
  callbacks: Set<() => void>;
}

export interface AffineDownloadProvider extends BaseProvider {
  flavour: 'affine-download';
}

export interface BroadCastChannelProvider extends BaseProvider {
  flavour: 'broadcast-channel';
}

export interface LocalIndexedDBProvider extends BackgroundProvider {
  flavour: 'local-indexeddb';
}

export interface AffineWebSocketProvider extends BaseProvider {
  flavour: 'affine-websocket';
}

export type Provider =
  | LocalIndexedDBProvider
  | AffineWebSocketProvider
  | BroadCastChannelProvider;

export type AffineOfficialWorkspace = AffineWorkspace | LocalWorkspace;

export type RemWorkspace = AffineOfficialWorkspace;

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
