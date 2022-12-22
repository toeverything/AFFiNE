import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
  authorizationEvent,
  AccessTokenMessage,
  getWorkspaces,
  WorkspaceType,
  getWorkspaceDetail,
} from '@pathfinder/data-services';
import { AppState } from './context';
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

  const loadWorkspace =
    useRef<(workspaceId: string) => Promise<Workspace | null> | null>();
  loadWorkspace.current = async (workspaceId: string) => {
    if (state.currentWorkspaceId === workspaceId) {
      return state.currentWorkspace;
    }
    const workspace = (await loadWorkspaceHandler?.(workspaceId, true)) || null;

    // @ts-expect-error
    window.workspace = workspace;
    // FIXME: there needs some method to destroy websocket.
    // Or we need a manager to manage websocket.
    // @ts-expect-error
    state.currentWorkspace?.__ws__?.destroy();

    setState(state => ({
      ...state,
      currentWorkspace: workspace,
      currentWorkspaceId: workspaceId,
    }));
    return workspace;
  };
  const loadPage = useRef<(pageId: string) => Promise<Page | null> | null>();
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

  const createPage = useRef<(pageId?: string) => Promise<string | null>>();

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
    const callback = async (user: AccessTokenMessage | null) => {
      const workspacesMeta = user ? await getWorkspaces() : [];
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
      setState(state => ({ ...state, user: user, workspacesMeta, workspaces }));
    };
    authorizationEvent.onChange(callback);

    return () => {
      authorizationEvent.removeCallback(callback);
    };
  }, [loadWorkspaceHandler]);

  const context = useMemo(
    () => ({
      ...state,
      setState,
      createEditor,
      setEditor,
      loadWorkspace,
      loadPage,
      createPage,
    }),
    [state, setState, loadPage, loadWorkspace]
  );

  return (
    <AppState.Provider value={context}>
      <DynamicBlocksuite
        setLoadWorkspaceHandler={setLoadWorkspaceHandler}
        setCreateEditorHandler={setCreateEditorHandler}
      />
      {loadWorkspaceHandler ? children : null}
    </AppState.Provider>
  );
};
