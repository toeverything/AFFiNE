import { createContext, useContext, useEffect, useState, useRef } from 'react';
import type { PropsWithChildren } from 'react';
import {
  AppStateContext,
  AppStateFunction,
  AppStateValue,
  PageMeta,
} from './interface';
import { useGlobalState, useGlobalStateApi } from '@/store/app';

export interface Disposable {
  dispose(): void;
}

type AppStateContextProps = PropsWithChildren<Record<string, unknown>>;

export const AppState = createContext<AppStateContext>({} as AppStateContext);

export const useAppState = () => useContext(AppState);
export const AppStateProvider = ({
  children,
}: PropsWithChildren<AppStateContextProps>) => {
  const globalStateApi = useGlobalStateApi();
  const [appState, setAppState] = useState<AppStateValue>({} as AppStateValue);
  const [blobState, setBlobState] = useState(false);

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

  const onceRef = useRef(true);
  const dataCenter = useGlobalState(store => store.dataCenter);
  useEffect(() => {
    if (dataCenter !== null) {
      if (onceRef.current) {
        setAppState({
          workspaceList: dataCenter.workspaces,
          currentWorkspace: null,
          pageList: [],
          synced: true,
        });
        onceRef.current = false;
      } else {
        console.warn('dataCenter Effect called twice. Please fix this ASAP');
      }
    }
  }, [dataCenter]);

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
    const { dataCenter } = globalStateApi.getState();
    const { workspaceList, currentWorkspace } = appState;
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
      const userInfo = globalStateApi.getState().user;
      // We must ensure workspace.owner exists, then ensure id same.
      isOwner = workspace?.owner && userInfo?.id === workspace.owner.id;
    }

    const pageList =
      (workspace?.blocksuiteWorkspace?.meta.pageMetas as PageMeta[]) ?? [];
    if (workspace?.blocksuiteWorkspace) {
      globalStateApi.getState().setWorkspace(workspace.blocksuiteWorkspace);
    }
    globalStateApi.setState({
      isOwner,
    });

    setAppState({
      ...appState,
      currentWorkspace: workspace,
      pageList: pageList,
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

  return (
    <AppState.Provider
      value={{
        ...appState,
        loadWorkspace: loadWorkspace,
        blobDataSynced: blobState,
      }}
    >
      {children}
    </AppState.Provider>
  );
};
