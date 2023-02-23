import { Workspace as RemoteWorkspace } from '@affine/datacenter';
import { __unstableSchemas, builtInSchemas } from '@blocksuite/blocks/models';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { NextPage } from 'next';
import { ReactElement, ReactNode } from 'react';

import { createAffineProviders } from '../blocksuite';
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
  const blockSuiteWorkspace = new BlockSuiteWorkspace({
    room: unSyncedWorkspace.id,
    blobOptionsGetter: (k: string) =>
      // fixme: token could be expired
      ({ api: '/api/workspace', token: apis.auth.token }[k]),
  })
    .register(builtInSchemas)
    .register(__unstableSchemas);
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

export interface LocalProvider extends BaseProvider {
  flavour: 'local';
}

export interface AffineProvider extends BaseProvider {
  flavour: 'affine';
}

export type Provider = LocalProvider | AffineProvider;

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

export const fetcher = (query: string) => {
  if (query === 'getUser') {
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
