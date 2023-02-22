import {
  AccessTokenMessage,
  createAuthClient,
  createBareClient,
  getApis,
  GoogleAuth,
  Workspace,
} from '@affine/datacenter';
import { NextPage } from 'next';
import { useMemo, useSyncExternalStore } from 'react';
import useSWR, { mutate } from 'swr';

const bareAuth = createBareClient('/');
const googleAuth = new GoogleAuth(bareAuth);
const clientAuth = createAuthClient(bareAuth, googleAuth);
const apis = getApis(bareAuth, clientAuth, googleAuth);

type RemWorkspace = Workspace;

const localWorkspaces: RemWorkspace[] = [];
const callback = new Set<() => void>();

function useLocalWorkspaces(): RemWorkspace[] {
  return useSyncExternalStore(
    onStoreChange => {
      callback.add(onStoreChange);
      return () => {
        callback.delete(onStoreChange);
      };
    },
    () => localWorkspaces,
    () => []
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

function useRemoteWorkspace(): RemWorkspace[] {
  // apis.getWorkspaces();
  const { data } = useSWR<RemWorkspace[]>(QueryKey.getWorkspaces, fetcher, {
    fallbackData: [],
  });
  return data ?? [];
}

function useWorkspace(workspaceId: string | null): RemWorkspace | null {
  const remoteWorkspace = useRemoteWorkspace();
  const localWorkspace = useLocalWorkspaces();
  return useMemo(
    () =>
      [...localWorkspace, ...remoteWorkspace].find(
        ws => ws.id === workspaceId
      ) ?? null,
    [remoteWorkspace, localWorkspace, workspaceId]
  );
}

const IndexPage: NextPage = () => {
  const remoteWorkspaces = useRemoteWorkspace();
  const user = useCurrentUser();
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
