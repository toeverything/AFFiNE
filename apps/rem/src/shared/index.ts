import { WebsocketProvider, Workspace } from '@affine/datacenter';
import { __unstableSchemas, builtInSchemas } from '@blocksuite/blocks/models';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';

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
  let webSocketProvider: WebsocketProvider | null = null;
  return {
    ...unSyncedWorkspace,
    blockSuiteWorkspace,
    firstBinarySynced: true,
    providers: [
      {
        flavour: 'affine',
        connect: () => {
          const wsUrl = `${
            window.location.protocol === 'https:' ? 'wss' : 'ws'
          }://${window.location.host}/api/sync/`;
          webSocketProvider = new WebsocketProvider(
            wsUrl,
            blockSuiteWorkspace.room as string,
            blockSuiteWorkspace.doc,
            {
              params: { token: apis.auth.refresh },
              // @ts-expect-error ignore the type
              awareness: blockSuiteWorkspace.awarenessStore.awareness,
            }
          );
          console.log('connect', webSocketProvider.roomname);
          webSocketProvider.connect();
        },
        disconnect: () => {
          if (!webSocketProvider) {
            console.error('cannot find websocket provider');
            return;
          }
          console.log('disconnect', webSocketProvider.roomname);
          webSocketProvider?.disconnect();
        },
      },
    ],
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
