import { Workspace } from '@affine/datacenter';
import { __unstableSchemas, builtInSchemas } from '@blocksuite/blocks/models';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';

import { createAffineProviders } from '../blocksuite';
import { apis } from './apis';

export { BlockSuiteWorkspace };

export interface WorkspaceHandler {
  syncBinary: () => Promise<void>;
}

export interface SyncedWorkspace extends Workspace, WorkspaceHandler {
  firstBinarySynced: true;
  blockSuiteWorkspace: BlockSuiteWorkspace;
  providers: Provider[];
}

export interface UnSyncedWorkspace extends Workspace, WorkspaceHandler {
  firstBinarySynced: false;
}

export const transformToSyncedWorkspace = (
  unSyncedWorkspace: UnSyncedWorkspace,
  binary: ArrayBuffer
): SyncedWorkspace => {
  const blockSuiteWorkspace = new BlockSuiteWorkspace({
    room: unSyncedWorkspace.id,
  })
    .register(builtInSchemas)
    .register(__unstableSchemas);
  BlockSuiteWorkspace.Y.applyUpdate(
    blockSuiteWorkspace.doc,
    new Uint8Array(binary)
  );
  return {
    ...unSyncedWorkspace,
    blockSuiteWorkspace,
    firstBinarySynced: true,
    providers: [...createAffineProviders(blockSuiteWorkspace)],
  };
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

export interface PersistenceWorkspace extends Workspace {
  providers: Provider['flavour'][];
}

export const transformToJSON = (
  workspace: RemWorkspace
): PersistenceWorkspace => {
  return {
    create_at: workspace.create_at,
    permission_type: workspace.permission_type,
    public: false,
    type: workspace.type,
    id: workspace.id,
    providers: workspace.firstBinarySynced
      ? workspace.providers.map(p => p.flavour)
      : [],
  };
};

export const fromJSON = (json: PersistenceWorkspace): RemWorkspace => {
  return {
    create_at: json.create_at,
    permission_type: json.permission_type,
    public: json.public,
    type: json.type,
    id: json.id,
    firstBinarySynced: false,
    syncBinary: () => Promise.resolve(),
  };
};

export type RemWorkspace = UnSyncedWorkspace | SyncedWorkspace;

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
