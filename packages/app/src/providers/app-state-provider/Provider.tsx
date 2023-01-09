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
import { Workspace } from '@blocksuite/store';
import { WorkspaceInfo } from '@affine/datacenter/dist/src/types';

type AppStateContextProps = PropsWithChildren<Record<string, unknown>>;

export const AppState = createContext<AppStateContext>({} as AppStateContext);

export const useAppState = () => useContext(AppState);

export const AppStateProvider = ({
  children,
}: PropsWithChildren<AppStateContextProps>) => {
  const [appState, setAppState] = useState<AppStateValue>({} as AppStateValue);

  useEffect(() => {
    const init = async () => {
      const dataCenter = await getDataCenter();

      if (dataCenter.workspaces.length === 0) {
        await createDefaultWorkspace(dataCenter);
      }
      let currentWorkspace = appState.currentWorkspace;
      if (!currentWorkspace) {
        currentWorkspace = await dataCenter.loadWorkspace(
          dataCenter.workspaces[0].id
        );
      }
      const currentMetaWorkSpace = dataCenter.workspaces.find(item => {
        return item.id === currentWorkspace.room;
      });

      setAppState({
        dataCenter,
        user: (await dataCenter.getUserInfo()) || null,
        workspaceList: dataCenter.workspaces,
        currentWorkspaceId: dataCenter.workspaces[0].id,
        currentWorkspace,
        pageList: currentWorkspace.meta.pageMetas as PageMeta[],
        currentPage: null,
        editor: null,
        synced: true,
        currentMetaWorkSpace: currentMetaWorkSpace ?? null,
      });
    };

    init();
  }, [appState.currentWorkspace]);

  useEffect(() => {
    if (!appState?.currentWorkspace) {
      return;
    }
    const currentWorkspace = appState.currentWorkspace;
    const dispose = currentWorkspace.meta.pagesUpdated.on(() => {
      setAppState({
        ...appState,
        pageList: currentWorkspace.meta.pageMetas as PageMeta[],
      });
    }).dispose;
    return () => {
      dispose();
    };
  }, [appState]);

  useEffect(() => {
    const { dataCenter } = appState;
    // FIXME: onWorkspacesChange should have dispose function
    dataCenter?.onWorkspacesChange(() => {
      setAppState({
        ...appState,
        workspaceList: dataCenter.workspaces,
      });
    });
  }, [appState]);

  const loadPage = useRef<AppStateFunction['loadPage']>();
  loadPage.current = (pageId: string) => {
    const { currentWorkspace, currentPage } = appState;
    if (pageId === currentPage?.id) {
      return;
    }
    const page = currentWorkspace?.getPage(pageId) || null;
    setAppState({
      ...appState,
      currentPage: page,
    });
  };

  const loadWorkspace = useRef<AppStateFunction['loadWorkspace']>();
  loadWorkspace.current = async (workspaceId: string) => {
    const { dataCenter, workspaceList, currentWorkspaceId, currentWorkspace } =
      appState;
    if (!workspaceList.find(v => v.id === workspaceId)) {
      return null;
    }
    if (workspaceId === currentWorkspaceId) {
      return currentWorkspace;
    }
    const workspace = await dataCenter.loadWorkspace(workspaceId);
    const currentMetaWorkSpace = dataCenter.workspaces.find(
      (item: WorkspaceInfo) => {
        return item.id === workspace.room;
      }
    );
    setAppState({
      ...appState,
      currentWorkspace: workspace,
      currentWorkspaceId: workspaceId,
      currentMetaWorkSpace: currentMetaWorkSpace ?? null,
    });

    return workspace;
  };

  const setEditor: AppStateFunction['setEditor'] =
    useRef() as AppStateFunction['setEditor'];
  setEditor.current = editor => {
    setAppState({
      ...appState,
      editor,
    });
  };

  return (
    <AppState.Provider
      value={{
        ...appState,
        setEditor,
        loadPage: loadPage.current,
        loadWorkspace: loadWorkspace.current,
      }}
    >
      {children}
    </AppState.Provider>
  );
};
