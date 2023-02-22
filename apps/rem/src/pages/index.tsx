import {
  AccessTokenMessage,
  createAuthClient,
  createBareClient,
  getApis,
  GoogleAuth,
  Workspace,
} from '@affine/datacenter';
import { atom, useAtom } from 'jotai';
import { NextPage } from 'next';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import useSWR, { preload } from 'swr';

import { RemWorkspace, transformToSyncedWorkspace } from '../shared';

const Editor = dynamic(
  async () => (await import('@blocksuite/react/editor')).Editor,
  {
    ssr: false,
  }
);

const bareAuth = createBareClient('/');
const googleAuth = new GoogleAuth(bareAuth);
const clientAuth = createAuthClient(bareAuth, googleAuth);
const apis = getApis(bareAuth, clientAuth, googleAuth);

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
              const syncedWorkspace = transformToSyncedWorkspace(
                remWorkspace,
                binary
              );
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

prefetchNecessaryData();

const currentWorkspaceIdAtom = atom<string | null>(null);
const currentPageId = atom<string | null>(null);

function useCurrentWorkspace() {
  const [id, setId] = useAtom(currentWorkspaceIdAtom);
  return [useWorkspace(id), setId] as const;
}

function useCurrentPage() {
  const [id, setId] = useAtom(currentPageId);
  const [currentWorkspace] = useCurrentWorkspace();
  return [
    currentWorkspace?.firstBinarySynced && id
      ? currentWorkspace.blockSuiteWorkspace.getPage(id)
      : null,
    setId,
  ] as const;
}

function Workspace({ workspace }: { workspace: RemWorkspace }) {
  const [, set] = useCurrentWorkspace();
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
  return (
    <div
      onClick={() => {
        set(workspace.id);
      }}
    >
      {workspace.blockSuiteWorkspace.meta.name}
    </div>
  );
}

function WorkspacePreview({ workspace }: { workspace: RemWorkspace }) {
  if (!workspace.firstBinarySynced) {
    return <div>loading...</div>;
  }
  const [, setId] = useCurrentPage();
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  return (
    <div>
      <div>page list</div>
      <div
        style={{
          border: '1px solid black',
        }}
      >
        {blockSuiteWorkspace.meta.pageMetas.map(pageMeta => {
          return (
            <div
              onClick={() => {
                setId(pageMeta.id);
              }}
              key={pageMeta.id}
            >
              {pageMeta.title}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkspaceList({ workspace }: { workspace: RemWorkspace[] }) {
  return (
    <div
      style={{
        border: '1px solid black',
      }}
    >
      {workspace.map(ws => (
        <Workspace key={ws.id} workspace={ws} />
      ))}
    </div>
  );
}

const IndexPage: NextPage = () => {
  const workspaces = useWorkspaces();
  const user = useCurrentUser();
  const [currentWorkspace] = useCurrentWorkspace();
  const [currentPage] = useCurrentPage();
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
      {currentWorkspace ? (
        <WorkspacePreview workspace={currentWorkspace} />
      ) : (
        <div>no current workspace</div>
      )}
      {currentPage ? (
        <Editor page={() => currentPage} />
      ) : (
        <div>no current page</div>
      )}
    </div>
  );
};

export default IndexPage;
