import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
  authorizationEvent,
  AccessTokenMessage,
  getWorkspaces,
} from '@pathfinder/data-services';
import { AppState } from './context';
import type {
  AppStateValue,
  CreateEditorHandler,
  LoadWorkspaceHandler,
} from './context';
import type { Page, Workspace } from '@blocksuite/store';
import { EditorContainer } from '@blocksuite/editor';
import { PageMeta } from './interface';
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
    const workspace = (await loadWorkspaceHandler?.(workspaceId)) || null;
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
    const page = currentWorkspace?.getPage(pageId) || null;
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
      const pageMeta = currentWorkspace?.meta.pageMetas.find(
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
      setState(state => ({ ...state, user: user, workspacesMeta }));
    };
    authorizationEvent.onChange(callback);

    return () => {
      authorizationEvent.removeCallback(callback);
    };
  }, []);

  const context = useMemo(
    () => ({
      ...state,
      setState,
      createEditor,
      setEditor,
      loadWorkspace,
      loadPage,
      createPage,
      getPageMeta: (pageId: string) => {
        const { currentWorkspace } = state;
        if (!currentWorkspace) {
          return null;
        }
        return (
          (currentWorkspace.meta.pageMetas.find(
            page => page.id === pageId
          ) as PageMeta) || null
        );
      },
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
