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
import { WorkspaceInfo } from '@affine/datacenter';

type AppStateContextProps = PropsWithChildren<Record<string, unknown>>;

export const AppState = createContext<AppStateContext>({} as AppStateContext);

export const useAppState = () => useContext(AppState);

export const AppStateProvider = ({
  children,
}: PropsWithChildren<AppStateContextProps>) => {
  const [appState, setAppState] = useState<AppStateValue>({} as AppStateValue);

  useEffect(() => {
    const initState = async () => {
      const dataCenter = await getDataCenter();

      // Ensure datacenter has at least one workspace
      if (dataCenter.workspaces.length === 0) {
        await createDefaultWorkspace(dataCenter);
      }

      setAppState({
        dataCenter,
        user: (await dataCenter.getUserInfo()) || null,
        workspaceList: dataCenter.workspaces,
        currentWorkspaceId: '',
        currentWorkspace: null,
        pageList: [],
        currentPage: null,
        editor: null,
        synced: true,
        currentMetaWorkSpace: null,
      });
    };

    initState();
  }, []);

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
    if (!workspaceList.find(v => v.id.toString() === workspaceId)) {
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
      pageList: currentWorkspace?.meta.pageMetas as PageMeta[],
      currentPage: null,
      editor: null,
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
