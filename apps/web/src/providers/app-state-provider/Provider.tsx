import { createContext, useContext, useEffect, useState, useRef } from 'react';
import type { PropsWithChildren } from 'react';
import { getDataCenter } from '@affine/datacenter';
import {
  AppStateContext,
  AppStateFunction,
  AppStateValue,
  PageMeta,
} from './interface';
import { createDefaultWorkspace } from './utils';
import { User } from '@affine/datacenter';
import { useBlockSuiteApi } from '@/store/workspace';

export interface Disposable {
  dispose(): void;
}

type AppStateContextProps = PropsWithChildren<Record<string, unknown>>;

export const AppState = createContext<AppStateContext>({} as AppStateContext);

export const useAppState = () => useContext(AppState);
export const AppStateProvider = ({
  children,
}: PropsWithChildren<AppStateContextProps>) => {
  const blocksuiteApi = useBlockSuiteApi();
  const [appState, setAppState] = useState<AppStateValue>({} as AppStateValue);
  const { dataCenter } = appState;
  const [blobState, setBlobState] = useState(false);
  const [userInfo, setUser] = useState<User | null>({} as User);
  useEffect(() => {
    const initState = async () => {
      const dataCenter = await getDataCenter();
      // Ensure datacenter has at least one workspace
      if (dataCenter.workspaces.length === 0) {
        await createDefaultWorkspace(dataCenter);
      }
      setUser(
        (await dataCenter.getUserInfo(
          dataCenter.providers.filter(p => p.id !== 'local')[0]?.id
        )) || null
      );
      setAppState({
        dataCenter,
        workspaceList: dataCenter.workspaces,
        currentWorkspace: null,
        pageList: [],
        synced: true,
        isOwner: false,
      });
    };

    initState();
  }, []);

  useEffect(() => {
    if (!appState?.currentWorkspace?.blocksuiteWorkspace) {
      return;
    }
    const currentWorkspace = appState.currentWorkspace;
    const dispose = currentWorkspace?.blocksuiteWorkspace?.meta.pagesUpdated.on(
      () => {
        setAppState({
          ...appState,
          pageList: currentWorkspace.blocksuiteWorkspace?.meta
            .pageMetas as PageMeta[],
        });
      }
    ).dispose;
    return () => {
      dispose && dispose();
    };
  }, [appState]);

  useEffect(() => {
    // FIXME: onWorkspacesChange should have dispose function
    return dataCenter?.onWorkspacesChange(
      () => {
        setAppState(_appState => ({
          ..._appState,
          workspaceList: dataCenter.workspaces,
        }));
      },
      { immediate: false }
    );
  }, [dataCenter]);

  const loadWorkspace: AppStateFunction['loadWorkspace'] =
    useRef() as AppStateFunction['loadWorkspace'];
  loadWorkspace.current = async (workspaceId, abort) => {
    const { dataCenter, workspaceList, currentWorkspace } = appState;
    if (!workspaceList.find(v => v.id.toString() === workspaceId)) {
      return null;
    }
    if (workspaceId === currentWorkspace?.id) {
      return currentWorkspace;
    }

    let aborted = false;

    const onAbort = () => {
      aborted = true;
    };

    abort?.addEventListener('abort', onAbort);

    const workspace = (await dataCenter.loadWorkspace(workspaceId)) ?? null;

    if (aborted) {
      // do not update state if aborted
      return null;
    }

    let isOwner;
    if (workspace?.provider === 'local') {
      // isOwner is useful only in the cloud
      isOwner = true;
    } else {
      // We must ensure workspace.owner exists, then ensure id same.
      isOwner = workspace?.owner && userInfo?.id === workspace.owner.id;
    }

    const pageList =
      (workspace?.blocksuiteWorkspace?.meta.pageMetas as PageMeta[]) ?? [];
    if (workspace?.blocksuiteWorkspace) {
      blocksuiteApi.getState().setWorkspace(workspace.blocksuiteWorkspace);
    }
    setAppState({
      ...appState,
      currentWorkspace: workspace,
      pageList: pageList,
      isOwner,
    });

    abort?.removeEventListener('abort', onAbort);

    return workspace;
  };

  useEffect(() => {
    let syncChangeDisposable: Disposable | undefined;
    const currentWorkspace = appState.currentWorkspace;
    if (!currentWorkspace) {
      return;
    }
    const getBlobStorage = async () => {
      const blobStorage = await currentWorkspace?.blocksuiteWorkspace?.blobs;
      syncChangeDisposable = blobStorage?.signals.onBlobSyncStateChange.on(
        () => {
          setBlobState(blobStorage?.uploading);
        }
      );
    };
    getBlobStorage();
    return () => {
      syncChangeDisposable?.dispose();
    };
  }, [appState.currentWorkspace]);

  const login = async () => {
    const { dataCenter } = appState;
    try {
      await dataCenter.login();
      const user = (await dataCenter.getUserInfo()) as User;
      if (!user) {
        throw new Error('User info not found');
      }
      setUser(user);
      return user;
    } catch (error) {
      return null; // login failed
    }
  };

  const logout = async () => {
    const { dataCenter } = appState;
    await dataCenter.logout();
    setUser(null);
  };

  return (
    <AppState.Provider
      value={{
        ...appState,
        loadWorkspace: loadWorkspace,
        login,
        logout,
        blobDataSynced: blobState,
        user: userInfo,
      }}
    >
      {children}
    </AppState.Provider>
  );
};
