import { useMemo, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
  authorizationEvent,
  AccessTokenMessage,
  getWorkspaces,
} from '@pathfinder/data-services';
import { AppState } from './context';
import type { AppStateValue, AppStateContext } from './context';

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
    useState<AppStateContext['loadWorkspace']>();
  const setLoadWorkspaceHandler = useCallback(
    (handler: AppStateContext['loadWorkspace']) => {
      _setLoadWorkspaceHandler(() => handler);
    },
    [_setLoadWorkspaceHandler]
  );

  const [createEditorHandler, _setCreateEditorHandler] =
    useState<AppStateContext['createEditor']>();
  const setCreateEditorHandler = useCallback(
    (handler: AppStateContext['createEditor']) => {
      _setCreateEditorHandler(() => handler);
    },
    [_setCreateEditorHandler]
  );

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
      createEditor: () => {
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
      },
      setEditor: (editor: AppStateValue['editor']) => {
        setState(state => ({ ...state, editor }));
      },
      loadWorkspace: async (workspaceId: string) => {
        const workspace = (await loadWorkspaceHandler?.(workspaceId)) || null;
        setState(state => ({
          ...state,
          currentWorkspace: workspace,
          currentWorkspaceId: workspaceId,
        }));
        return workspace;
      },
      loadPage: async (pageId: string) => {
        const { currentWorkspace, currentPage } = state;
        if (pageId === currentPage?.pageId) {
          return currentPage;
        }
        const page = currentWorkspace?.getPage(pageId) || null;
        setState(state => ({ ...state, currentPage: page }));
        return page;
      },
      createPage: (pageId: string = Date.now().toString()) =>
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
        }),
      getPageMeta: (pageId: string) => {
        const { currentWorkspace } = state;
        if (!currentWorkspace) {
          return null;
        }
        return (
          currentWorkspace.meta.pageMetas.find(page => page.id === pageId) ||
          null
        );
      },
      toggleFavoritePage: (pageId: string) => {
        const { currentWorkspace } = state;
        if (!currentWorkspace) {
          return;
        }
        const pageMeta = currentWorkspace.meta.pageMetas.find(
          p => p.id === pageId
        );
        if (pageMeta) {
          currentWorkspace.setPageMeta(pageId, {
            favorite: !pageMeta.favorite,
          });
        }
      },
      toggleDeletePage: (pageId: string) => {
        const { currentWorkspace } = state;
        const pageMeta = currentWorkspace?.meta.pageMetas.find(
          p => p.id === pageId
        );
        if (pageMeta) {
          currentWorkspace!.setPageMeta(pageId, {
            trash: !pageMeta.trash,
            trashDate: +new Date(),
          });
        }
      },
    }),
    [state, setState, loadWorkspaceHandler, createEditorHandler]
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
