import { AccessTokenMessage, Workspace } from '@affine/datacenter';
import { PageMeta } from '@blocksuite/store';
import { atom, useAtom } from 'jotai';
import { NextPage } from 'next';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import useSWR, { preload } from 'swr';

import {
  BlockSuiteWorkspace,
  RemWorkspace,
  transformToSyncedWorkspace,
} from '../shared';
import { apis } from '../shared/apis';

const Editor = dynamic(
  async () => (await import('../components/BlockSuiteEditor')).Editor,
  {
    ssr: false,
  }
);

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

// callback.add(() => {
//   if (typeof window === 'undefined') {
//
//   }
// })

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
                localWorkspaces.splice(index, 1, syncedWorkspace);
                localWorkspaces = [...localWorkspaces];
                callback.forEach(cb => cb());
              }
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
  const [currentWorkspace, setCurrentWorkspaceId] = useCurrentWorkspace();
  const [, setCurrentPageId] = useCurrentPage();
  useEffect(() => {
    if (!workspace.firstBinarySynced) {
      workspace.syncBinary();
    }
  }, [workspace]);
  useEffect(() => {
    if (workspace.firstBinarySynced && currentWorkspace === workspace) {
      workspace.providers.forEach(provider => {
        provider.connect();
      });
      return () => {
        workspace.providers.forEach(provider => {
          provider.disconnect();
        });
      };
    }
  }, [workspace, currentWorkspace]);
  if (!workspace.firstBinarySynced) {
    return <div>loading...</div>;
  }
  return (
    <div
      data-workspace-id={workspace.id}
      onClick={() => {
        setCurrentWorkspaceId(workspace.id);
        setCurrentPageId(null);
      }}
    >
      {workspace.blockSuiteWorkspace.meta.name}
    </div>
  );
}

function useBlockSuiteWorkspacePageMetas(
  blockSuiteWorkspace: BlockSuiteWorkspace
): PageMeta[] {
  const [pageMetas, setPageMetas] = useState(
    () => blockSuiteWorkspace.meta.pageMetas
  );
  const [prev, setPrev] = useState(() => blockSuiteWorkspace);
  if (prev !== blockSuiteWorkspace) {
    setPrev(blockSuiteWorkspace);
    setPageMetas(blockSuiteWorkspace.meta.pageMetas);
  }
  useEffect(() => {
    const dispose = blockSuiteWorkspace.meta.pagesUpdated.on(() => {
      setPageMetas(blockSuiteWorkspace.meta.pageMetas);
    });
    return () => {
      dispose.dispose();
    };
  }, [blockSuiteWorkspace]);
  return pageMetas;
}

function WorkspacePreview({ workspace }: { workspace: RemWorkspace }) {
  if (!workspace.firstBinarySynced) {
    return <div>loading...</div>;
  }
  const [, setId] = useCurrentPage();
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const pageMetas = useBlockSuiteWorkspacePageMetas(blockSuiteWorkspace);
  console.log('pageMetas', pageMetas);
  return (
    <div>
      <div>page list</div>
      <div
        style={{
          border: '1px solid black',
        }}
      >
        {pageMetas.map(pageMeta => {
          return (
            <div
              onClick={() => {
                setId(pageMeta.id);
              }}
              key={pageMeta.id}
            >
              {pageMeta.title || 'Untitled'}
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
        <Editor page={currentPage} key={currentPage.id} />
      ) : (
        <div>no current page</div>
      )}
    </div>
  );
};

export default IndexPage;
