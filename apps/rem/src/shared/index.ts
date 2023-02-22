import { Workspace } from '@affine/datacenter';
import { __unstableSchemas, builtInSchemas } from '@blocksuite/blocks/models';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';

export interface WorkspaceHandler {
  syncBinary: () => Promise<void>;
  connect: () => void;
  disconnect: () => void;
}

export interface SyncedWorkspace extends Workspace, WorkspaceHandler {
  firstBinarySynced: true;
  blockSuiteWorkspace: BlockSuiteWorkspace;
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
    connect: () => blockSuiteWorkspace.connect(),
    disconnect: () => blockSuiteWorkspace.disconnect(),
  };
};

export interface PersistenceWorkspace extends Workspace {
  blockSuiteWorkspaceRoom: BlockSuiteWorkspace['room'];
}

export const transformToJSON = (workspace: RemWorkspace) => {};

export type RemWorkspace = UnSyncedWorkspace | SyncedWorkspace;
