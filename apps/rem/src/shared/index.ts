import { Workspace as RemoteWorkspace } from '@affine/datacenter';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { NextPage } from 'next';
import { ReactElement, ReactNode } from 'react';

import { createAffineProviders } from '../blocksuite';
import { createEmptyBlockSuiteWorkspace } from '../utils';
import { apis } from './apis';

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
  [RemWorkspaceFlavour.AFFINE]:
    | AffineRemoteUnSyncedWorkspace
    | AffineRemoteSyncedWorkspace;
  [RemWorkspaceFlavour.LOCAL]: LocalWorkspace;
}

export interface WorkspaceHandler {
  syncBinary: () => Promise<void>;
}

export interface AffineRemoteSyncedWorkspace
  extends RemoteWorkspace,
    WorkspaceHandler {
  flavour: RemWorkspaceFlavour.AFFINE;
  firstBinarySynced: true;
  blockSuiteWorkspace: BlockSuiteWorkspace;
  providers: Provider[];
}

export interface AffineRemoteUnSyncedWorkspace
  extends RemoteWorkspace,
    WorkspaceHandler {
  flavour: RemWorkspaceFlavour.AFFINE;
  firstBinarySynced: false;
  // empty
  blockSuiteWorkspace: BlockSuiteWorkspace;
}

export interface LocalWorkspace extends WorkspaceHandler {
  flavour: RemWorkspaceFlavour.LOCAL;
  id: string;
  blockSuiteWorkspace: BlockSuiteWorkspace;
  providers: Provider[];
}

export const transformToAffineSyncedWorkspace = async (
  unSyncedWorkspace: AffineRemoteUnSyncedWorkspace,
  binary: ArrayBuffer
): Promise<AffineRemoteSyncedWorkspace> => {
  const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
    unSyncedWorkspace.id
  );
  BlockSuiteWorkspace.Y.applyUpdate(
    blockSuiteWorkspace.doc,
    new Uint8Array(binary)
  );
  return new Promise(resolve => {
    // Fixme: https://github.com/toeverything/blocksuite/issues/1350
    setTimeout(() => {
      resolve({
        ...unSyncedWorkspace,
        blockSuiteWorkspace,
        firstBinarySynced: true,
        providers: [...createAffineProviders(blockSuiteWorkspace)],
      });
    }, 0);
  });
};

export type BaseProvider = {
  flavour: string;
  connect: () => void;
  disconnect: () => void;
};

export interface LocalIndexedDBProvider extends BaseProvider {
  flavour: 'local-indexeddb';
}

export interface AffineWebSocketProvider extends BaseProvider {
  flavour: 'affine-websocket';
}

export type Provider = LocalIndexedDBProvider | AffineWebSocketProvider;

export interface PersistenceWorkspace extends RemoteWorkspace {
  flavour: 'affine' | 'local';
  providers: Provider['flavour'][];
}

export const transformToJSON = (
  workspace: RemWorkspace
): PersistenceWorkspace => {
  // fixme
  return null!;
};

export const fromJSON = (json: PersistenceWorkspace): RemWorkspace => {
  // fixme
  return null!;
};

export type RemWorkspace =
  | LocalWorkspace
  | AffineRemoteUnSyncedWorkspace
  | AffineRemoteSyncedWorkspace;

export const fetcher = async (query: string) => {
  if (query === QueryKey.getUser) {
    return apis.auth.user ?? null;
  }
  return (apis as any)[query]();
};

export const QueryKey = {
  getUser: 'getUser',
  getWorkspaces: 'getWorkspaces',
} as const;

export type NextPageWithLayout<P = Record<string, unknown>, IP = P> = NextPage<
  P,
  IP
> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

export const paths = {
  all: workspaceId => (workspaceId ? `/workspace/${workspaceId}/all` : ''),
  favorite: workspaceId =>
    workspaceId ? `/workspace/${workspaceId}/favorite` : '',
  trash: workspaceId => (workspaceId ? `/workspace/${workspaceId}/trash` : ''),
  setting: workspaceId =>
    workspaceId ? `/workspace/${workspaceId}/setting` : '',
} satisfies {
  all: (workspaceId: string | null) => string;
  favorite: (workspaceId: string | null) => string;
  trash: (workspaceId: string | null) => string;
  setting: (workspaceId: string | null) => string;
};
