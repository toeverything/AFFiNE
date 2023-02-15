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

export interface Disposable {
  dispose(): void;
}

type AppStateContextProps = PropsWithChildren<Record<string, unknown>>;

export const AppState = createContext<AppStateContext>({} as AppStateContext);

export const useAppState = () => useContext(AppState);
export const AppStateProvider = ({
  children,
}: PropsWithChildren<AppStateContextProps>) => {
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
        currentPage: null,
        editor: null,
        blockHub: null,
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

  const loadPage = useRef<AppStateFunction['loadPage']>();
  loadPage.current = pageId => {
    const { currentWorkspace, currentPage } = appState;
    if (pageId === currentPage?.id) {
      return;
    }
    const page = currentWorkspace?.blocksuiteWorkspace?.getPage(pageId) || null;
    setAppState({
      ...appState,
      currentPage: page,
    });
  };

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
    setAppState({
      ...appState,
      currentWorkspace: workspace,
      pageList: pageList,
      currentPage: null,
      editor: null,
      blockHub: null,
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

  const setEditor: AppStateFunction['setEditor'] =
    useRef() as AppStateFunction['setEditor'];
  setEditor.current = editor => {
    setAppState({
      ...appState,
      editor,
    });
  };
  const setBlockHub: AppStateFunction['setBlockHub'] =
    useRef() as AppStateFunction['setBlockHub'];
  setBlockHub.current = blockHub => {
    setAppState({
      ...appState,
      blockHub,
    });
  };

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
        setEditor,
        setBlockHub,
        loadPage: loadPage.current,
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
