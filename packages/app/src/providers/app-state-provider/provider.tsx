import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
  token,
  AccessTokenMessage,
  getWorkspaces,
} from '@pathfinder/data-services';
import { AppState, AppStateContext } from './context';
import type {
  AppStateValue,
  CreateEditorHandler,
  LoadWorkspaceHandler,
} from './context';
import type { Page, Workspace } from '@blocksuite/store';
import { EditorContainer } from '@blocksuite/editor';
const DynamicBlocksuite = dynamic(() => import('./dynamic-blocksuite'), {
  ssr: false,
});

export const AppStateProvider = ({ children }: { children?: ReactNode }) => {
  const [state, setState] = useState<AppStateValue>({
    user: null,
    workspacesMeta: [],
    currentWorkspaceId: '',
    currentWorkspace: null,
    currentPage: null,
    editor: null,
    workspaces: {},
    // Synced is used to ensure that the provider has synced with the server,
    // So after Synced set to true, the other state is sure to be set.
    synced: false,
  });

  const [loadWorkspaceHandler, _setLoadWorkspaceHandler] =
    useState<LoadWorkspaceHandler>();
  const setLoadWorkspaceHandler = useCallback(
    (handler: LoadWorkspaceHandler) => {
      _setLoadWorkspaceHandler(() => handler);
    },
    [_setLoadWorkspaceHandler]
  );

  const [createEditorHandler, _setCreateEditorHandler] =
    useState<CreateEditorHandler>();

  const setCreateEditorHandler = useCallback(
    (handler: CreateEditorHandler) => {
      _setCreateEditorHandler(() => handler);
    },
    [_setCreateEditorHandler]
  );

  const loadWorkspace = useRef<AppStateContext['loadWorkspace']>(() =>
    Promise.resolve(null)
  );
  loadWorkspace.current = async (workspaceId: string) => {
    if (state.currentWorkspaceId === workspaceId) {
      return state.currentWorkspace;
    }

    const workspace = (await loadWorkspaceHandler?.(workspaceId, true)) || null;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    window.workspace = workspace;
    // FIXME: there needs some method to destroy websocket.
    // Or we need a manager to manage websocket.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    state.currentWorkspace?.__ws__?.destroy();

    setState(state => ({
      ...state,
      currentWorkspace: workspace,
      currentWorkspaceId: workspaceId,
    }));
    return workspace;
  };
  const loadPage = useRef<AppStateContext['loadPage']>(() =>
    Promise.resolve(null)
  );
  loadPage.current = async (pageId: string) => {
    const { currentWorkspace, currentPage } = state;
    if (pageId === currentPage?.pageId) {
      return currentPage;
    }
    const page = (pageId ? currentWorkspace?.getPage(pageId) : null) || null;
    setState(state => ({ ...state, currentPage: page }));
    return page;
  };

  const createEditor = useRef<
    ((page: Page) => EditorContainer | null) | undefined
  >();
  createEditor.current = () => {
    const { currentPage, currentWorkspace } = state;
    if (!currentPage || !currentWorkspace) {
      return null;
    }
    const editor = createEditorHandler?.(currentPage) || null;

    if (editor) {
      const pageMeta = currentWorkspace.meta.pageMetas.find(
        p => p.id === currentPage.pageId
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

  const setEditor = useRef<(editor: AppStateValue['editor']) => void>();

  setEditor.current = (editor: AppStateValue['editor']) => {
    setState(state => ({ ...state, editor }));
  };

  const createPage = useRef<AppStateContext['createPage']>(() =>
    Promise.resolve(null)
  );

  createPage.current = (pageId: string = Date.now().toString()) =>
    new Promise<string | null>(resolve => {
      const { currentWorkspace } = state;
      if (!currentWorkspace) {
        resolve(null);
        return;
      }
      currentWorkspace.createPage(pageId);
      currentWorkspace.signals.pageAdded.once(addedPageId => {
        resolve(addedPageId);
      });
    });

  useEffect(() => {
    if (!loadWorkspaceHandler) {
      return;
    }
    const callback = async (user: AccessTokenMessage | null) => {
      const workspacesMeta = user
        ? await getWorkspaces().catch(() => {
            return [];
          })
        : [];

      const workspacesList = await Promise.all(
        workspacesMeta.map(async ({ id }) => {
          const workspace = (await loadWorkspaceHandler?.(id)) || null;
          return { id, workspace };
        })
      );

      const workspaces: Record<string, Workspace | null> = {};

      workspacesList.forEach(({ id, workspace }) => {
        workspaces[id] = workspace;
      });

      // TODO: add meta info to workspace meta
      setState(state => ({
        ...state,
        user: user,
        workspacesMeta,
        workspaces,
        synced: true,
      }));
    };
    token.onChange(callback);
    token.refreshToken();
    return () => {
      token.offChange(callback);
    };
  }, [loadWorkspaceHandler]);

  const context = useMemo(
    () => ({
      ...state,
      setState,
      createEditor,
      setEditor,
      loadWorkspace: loadWorkspace.current,
      loadPage: loadPage.current,
      createPage: createPage.current,
    }),
    [state, setState, loadPage, loadWorkspace]
  );

  return (
    <AppState.Provider value={context}>
      <DynamicBlocksuite
        setLoadWorkspaceHandler={setLoadWorkspaceHandler}
        setCreateEditorHandler={setCreateEditorHandler}
      />
      {children}
    </AppState.Provider>
  );
};
