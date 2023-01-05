import { useMemo, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { getDataCenter } from '@affine/datacenter';
import { AppState, AppStateContext } from './context';
import type {
  AppStateValue,
  CreateEditorHandler,
  LoadWorkspaceHandler,
} from './context';
import { Page } from '@blocksuite/store';
import { EditorContainer } from '@blocksuite/editor';
const DynamicBlocksuite = dynamic(() => import('./dynamic-blocksuite'), {
  ssr: false,
});

const loadWorkspaceHandler: LoadWorkspaceHandler = async workspaceId => {
  if (workspaceId) {
    const dc = await getDataCenter();
    return dc.load(workspaceId, { providerId: 'affine' });
  } else {
    return null;
  }
};
export const AppStateProvider = ({ children }: { children?: ReactNode }) => {
  const refreshWorkspacesMeta = async () => {
    const dc = await getDataCenter();
    const workspacesMeta = await dc.apis.getWorkspaces().catch(() => {
      return [];
    });
    setState(state => ({ ...state, workspacesMeta }));
  };

  const [state, setState] = useState<AppStateValue>({
    user: null,
    workspacesMeta: [],
    currentWorkspaceId: '',
    currentWorkspace: null,
    currentPage: null,
    editor: null,
    refreshWorkspacesMeta,
    synced: true,
  });

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
    const workspace =
      (await loadWorkspaceHandler(workspaceId, state.user)) || null;

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
    if (pageId === currentPage?.id) {
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

  const setEditor = useRef<(editor: AppStateValue['editor']) => void>();

  setEditor.current = (editor: AppStateValue['editor']) => {
    setState(state => ({ ...state, editor }));
  };

  const context = useMemo(
    () => ({
      ...state,
      setState,
      createEditor,
      setEditor,
      loadWorkspace: loadWorkspace.current,
      loadPage: loadPage.current,
    }),
    [state, setState, loadPage, loadWorkspace]
  );

  return (
    <AppState.Provider value={context}>
      <DynamicBlocksuite setCreateEditorHandler={setCreateEditorHandler} />
      {children}
    </AppState.Provider>
  );
};
