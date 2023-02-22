import {
  AccessTokenMessage,
  createAuthClient,
  createBareClient,
  getApis,
  GoogleAuth,
  Workspace,
} from '@affine/datacenter';
import { NextPage } from 'next';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import useSWR, { mutate, preload } from 'swr';

const bareAuth = createBareClient('/');
const googleAuth = new GoogleAuth(bareAuth);
const clientAuth = createAuthClient(bareAuth, googleAuth);
const apis = getApis(bareAuth, clientAuth, googleAuth);

interface RemWorkspace extends Workspace {
  synced: boolean;

  //# region side effect
  connect: () => void;
  disconnect: () => void;
  //# endregion
}

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

const IndexPage: NextPage = () => {
  const remoteWorkspaces = useWorkspaces();
  const user = useCurrentUser();
  useEffect(() => {
    const promise: Promise<Workspace[]> = preload(
      QueryKey.getWorkspaces,
      fetcher
    );
    promise.then(workspaces => {
      workspaces.forEach(workspace => {
        const exist = localWorkspaces.find(
          localWorkspace => localWorkspace.id === workspace.id
        );
        if (!exist) {
          localWorkspaces.push({
            ...workspace,
            synced: false,
            connect: () => {
              // todo
            },
            disconnect: () => {
              // todo
            },
          });
          localWorkspaces = [...localWorkspaces];
          callback.forEach(cb => cb());
        }
      });
    });
  }, []);
  return (
    <div>
      {user ? (
        <button
          onClick={async () => {
            apis.auth.clear();
            await apis.signOutFirebase();
            Object.values(QueryKey).forEach(query => {
              mutate(query);
            });
          }}
        >
          sign out
        </button>
      ) : (
        <button
          onClick={async () => {
            await apis.signInWithGoogle();
            Object.values(QueryKey).forEach(query => {
              mutate(query);
            });
          }}
        >
          {' '}
          sign in with google
        </button>
      )}
      <div>all workspaces</div>
      {remoteWorkspaces.map(ws => (
        <div key={ws.id}>{ws.id}</div>
      ))}
    </div>
  );
};

export default IndexPage;
