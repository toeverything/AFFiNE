import {
  AccessTokenMessage,
  createAuthClient,
  createBareClient,
  getApis,
  GoogleAuth,
  Workspace,
} from '@affine/datacenter';
import { __unstableSchemas, builtInSchemas } from '@blocksuite/blocks/models';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import useSWR, { preload } from 'swr';

const bareAuth = createBareClient('/');
const googleAuth = new GoogleAuth(bareAuth);
const clientAuth = createAuthClient(bareAuth, googleAuth);
const apis = getApis(bareAuth, clientAuth, googleAuth);

interface WorkspaceHandler {
  syncBinary: () => Promise<void>;
  connect: () => void;
  disconnect: () => void;
}

interface SyncedWorkspace extends Workspace, WorkspaceHandler {
  firstBinarySynced: true;
  blockSuiteWorkspace: BlockSuiteWorkspace;
}

interface UnSyncedWorkspace extends Workspace, WorkspaceHandler {
  firstBinarySynced: false;
}

type RemWorkspace = UnSyncedWorkspace | SyncedWorkspace;

let localWorkspaces: RemWorkspace[] = [];
const callback = new Set<() => void>();
const kWorkspaces = 'affine-workspaces';

if (typeof window !== 'undefined') {
  localWorkspaces = [
    ...localWorkspaces,
    ...(JSON.parse(
      localStorage.getItem(kWorkspaces) ?? '[]'
    ) as RemWorkspace[]),
  ];
  callback.forEach(cb => cb());
}

const emptyWorkspaces: RemWorkspace[] = [];

function useWorkspaces(): RemWorkspace[] {
  return useSyncExternalStore(
    useCallback(onStoreChange => {
      callback.add(onStoreChange);
      return () => {
        callback.delete(onStoreChange);
      };
    }, []),
    useCallback(() => localWorkspaces, []),
    useCallback(() => emptyWorkspaces, [])
  );
}

const fetcher = (query: string) => {
  if (query === 'getUser') {
    return apis.auth.user ?? null;
  }
  return (apis as any)[query]();
};

const QueryKey = {
  getUser: 'getUser',
  getWorkspaces: 'getWorkspaces',
} as const;

function useCurrentUser(): AccessTokenMessage | null {
  const { data } = useSWR<AccessTokenMessage | null>(
    QueryKey.getUser,
    fetcher,
    {
      fallbackData: null,
    }
  );
  return data ?? null;
}

function useWorkspace(workspaceId: string | null): RemWorkspace | null {
  const workspaces = useWorkspaces();
  return useMemo(
    () => [...workspaces].find(ws => ws.id === workspaceId) ?? null,
    [workspaces, workspaceId]
  );
}

function prefetchNecessaryData() {
  const promise: Promise<Workspace[]> = preload(
    QueryKey.getWorkspaces,
    fetcher
  );
  promise
    .then(workspaces => {
      workspaces.forEach(workspace => {
        const exist = localWorkspaces.find(
          localWorkspace => localWorkspace.id === workspace.id
        );
        if (!exist) {
          const remWorkspace: RemWorkspace = {
            ...workspace,
            firstBinarySynced: false,
            syncBinary: async () => {
              const binary = await apis.downloadWorkspace(
                workspace.id,
                workspace.public
              );
              if (remWorkspace.firstBinarySynced) {
                return;
              }
              const blockSuiteWorkspace = new BlockSuiteWorkspace({
                room: workspace.id,
              })
                .register(builtInSchemas)
                .register(__unstableSchemas);
              BlockSuiteWorkspace.Y.applyUpdate(
                blockSuiteWorkspace.doc,
                new Uint8Array(binary)
              );
              // force type cast
              const syncedWorkspace = remWorkspace as any as SyncedWorkspace;
              syncedWorkspace.firstBinarySynced = true;
              syncedWorkspace.blockSuiteWorkspace = blockSuiteWorkspace;
              const index = localWorkspaces.findIndex(
                ws => ws.id === syncedWorkspace.id
              );
              if (index > -1) {
                localWorkspaces.splice(index, 1, {
                  ...syncedWorkspace,
                });
                localWorkspaces = [...localWorkspaces];
                callback.forEach(cb => cb());
              }
            },
            connect: async () => {
              // todo
            },
            disconnect: () => {
              // todo
            },
          };
          localWorkspaces = [...localWorkspaces, remWorkspace];
          callback.forEach(cb => cb());
        }
      });
    })
    .catch(error => {
      console.error(error);
    });
}

function Workspace({ workspace }: { workspace: RemWorkspace }) {
  useEffect(() => {
    workspace.syncBinary();
  }, [workspace]);
  useEffect(() => {
    workspace.connect();
    return () => {
      workspace.disconnect();
    };
  }, [workspace]);
  if (!workspace.firstBinarySynced) {
    return <div>loading...</div>;
  }
  return <div>{workspace.blockSuiteWorkspace.meta.name}</div>;
}

function WorkspaceList({ workspace }: { workspace: RemWorkspace[] }) {
  return (
    <>
      {workspace.map(ws => (
        <Workspace key={ws.id} workspace={ws} />
      ))}
    </>
  );
}

const IndexPage: NextPage = () => {
  const workspaces = useWorkspaces();
  const user = useCurrentUser();
  useEffect(() => {
    prefetchNecessaryData();
  }, []);
  const router = useRouter();
  return (
    <div>
      {user ? (
        <button
          onClick={async () => {
            apis.auth.clear();
            await apis.signOutFirebase();
            router.reload();
          }}
        >
          sign out
        </button>
      ) : (
        <button
          onClick={async () => {
            await apis.signInWithGoogle();
            router.reload();
          }}
        >
          {' '}
          sign in with google
        </button>
      )}
      <div>all workspaces</div>
      <WorkspaceList workspace={workspaces} />
    </div>
  );
};

export default IndexPage;
