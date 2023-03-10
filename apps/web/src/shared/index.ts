import { Workspace as RemoteWorkspace } from '@affine/datacenter';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { NextPage } from 'next';
import { ReactElement, ReactNode } from 'react';

export { BlockSuiteWorkspace };

declare global {
  interface Window {
    CLIENT_APP?: boolean;
  }
}

export const enum RemWorkspaceFlavour {
  AFFINE = 'affine',
  LOCAL = 'local',
}

export interface FlavourToWorkspace {
  [RemWorkspaceFlavour.AFFINE]: AffineWorkspace;
  [RemWorkspaceFlavour.LOCAL]: LocalWorkspace;
}

export interface AffineWorkspace extends RemoteWorkspace {
  flavour: RemWorkspaceFlavour.AFFINE;
  // empty
  blockSuiteWorkspace: BlockSuiteWorkspace;
  providers: Provider[];
}

export interface LocalWorkspace {
  flavour: RemWorkspaceFlavour.LOCAL;
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

export const settingPanel = {
  General: 'general',
  Collaboration: 'collaboration',
  Publish: 'publish',
  Export: 'export',
  // TODO: add it back for desktop version
  // Sync = 'sync'
} as const;
export const settingPanelValues = [...Object.values(settingPanel)] as const;
export type SettingPanel = (typeof settingPanel)[keyof typeof settingPanel];

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

export const enum LoadPriority {
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3,
}
