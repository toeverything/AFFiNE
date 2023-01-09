import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import { getDataCenter } from '@affine/datacenter';
import { AppStateContext, AppStateValue } from './interface';
import { createDefaultWorkspace } from './utils';

type AppStateContextProps = PropsWithChildren<Record<string, unknown>>;
import dynamic from 'next/dynamic';
import { CreateEditorHandler } from '@/providers/app-state-provider3';

const DynamicBlocksuite = dynamic(() => import('./DynamicBlocksuite'), {
  ssr: false,
});
export const AppState = createContext<AppStateContext>({} as AppStateContext);

export const useAppState = () => useContext(AppState);

export const AppStateProvider = ({
  children,
}: PropsWithChildren<AppStateContextProps>) => {
  const [appState, setAppState] = useState<AppStateValue>({} as AppStateValue);

  const [createEditorHandler, _setCreateEditorHandler] =
    useState<CreateEditorHandler>();

  const setCreateEditorHandler = useCallback(
    (handler: CreateEditorHandler) => {
      _setCreateEditorHandler(() => handler);
    },
    [_setCreateEditorHandler]
  );

  useEffect(() => {
    const init = async () => {
      const dataCenter = await getDataCenter();

      if (dataCenter.workspaces.length === 0) {
        await createDefaultWorkspace(dataCenter);
      }

      const currentWorkspace = await dataCenter.loadWorkspace(
        dataCenter.workspaces[0].id
      );

      setAppState({
        dataCenter,
        user: await dataCenter.getUserInfo(),
        workspaceList: dataCenter.workspaces,
        currentWorkspaceId: dataCenter.workspaces[0].id,
        currentWorkspace,
        pageList: currentWorkspace.meta.pageMetas,
        currentPage: null,
        editor: null,
        synced: true,
      });
    };

    init();
  }, []);

  useEffect(() => {
    if (!appState?.currentWorkspace) {
      return;
    }
    const currentWorkspace = appState.currentWorkspace;
    const dispose = currentWorkspace.meta.pagesUpdated.on(() => {
      setAppState({
        ...appState,
        pageList: currentWorkspace.meta.pageMetas,
      });
    }).dispose;
    return () => {
      dispose();
    };
  }, [appState]);

  const loadPage = (pageId: string) => {
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

  const loadWorkspace = async (workspaceId: string) => {
    const { dataCenter, workspaceList, currentWorkspaceId } = appState;
    if (!workspaceList.find(v => v.id === workspaceId)) {
      return;
    }
    if (workspaceId === currentWorkspaceId) {
      return;
    }

    setAppState({
      ...appState,
      currentWorkspace: await dataCenter.loadWorkspace(workspaceId),
      currentWorkspaceId: workspaceId,
    });
  };

  const createEditor = () => {
    const { currentPage, currentWorkspace } = appState;
    if (!currentPage || !currentWorkspace) {
      return null;
    }

    const editor = createEditorHandler?.(currentPage) || null;

    if (editor) {
      const pageMeta = currentWorkspace.meta.pageMetas.find(
        p => p.id === currentPage.id
      );
      if (pageMeta?.mode) {
        editor.mode = pageMeta.mode as 'page' | 'edgeless' | undefined;
      }
      if (pageMeta?.trash) {
        editor.readonly = true;
      }
    }

    return editor;
  };

  const setEditor = (editor: AppStateValue['editor']) => {
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
        loadPage,
        loadWorkspace,
        createEditor,
      }}
    >
      <DynamicBlocksuite setCreateEditorHandler={setCreateEditorHandler} />

      {children}
    </AppState.Provider>
  );
};

export default AppStateProvider;
