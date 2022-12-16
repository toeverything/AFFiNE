import type { EditorContainer } from '@blocksuite/editor';
import { createContext, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import dynamic from 'next/dynamic';
import Loading from './loading';
import { Page, Workspace } from '@blocksuite/store';
import useEditorHandler from './hooks/useEditorHandler';
import {
  EditorHandlers,
  PageMeta,
  EditorContextValue,
  EditorContextProps,
} from './interface';
import usePropsUpdated from './hooks/usePropsUpdated';
import useHistoryUpdated from './hooks/useHistoryUpdated';
import useMode from './hooks/useMode';
// Blocksuite has to be imported dynamically since it has a lot of effects
const DynamicEditor = dynamic(() => import('./editor-reactor'), {
  ssr: false,
});

export const EditorContext = createContext<EditorContextValue>({
  mode: 'page',
  setMode: () => {},
  pageList: [],
  page: undefined,
  onPropsUpdated: () => {},
  onHistoryUpdated: () => {},
  editor: undefined,
  ...({} as EditorHandlers),
});

export const useEditor = () => useContext(EditorContext);

export const EditorProvider = ({
  children,
}: PropsWithChildren<EditorContextProps>) => {
  const [workspace, setWorkspace] = useState<Workspace>();
  const [page, setPage] = useState<Page>();
  const [pageList, setPageList] = useState<PageMeta[]>([]);
  const [editor, setEditor] = useState<EditorContainer>();

  const { mode, setMode } = useMode({ workspace, page });

  const editorHandlers = useEditorHandler({ workspace, editor });
  const onPropsUpdated = usePropsUpdated(editor);
  const onHistoryUpdated = useHistoryUpdated(page);
  // Modify the updatedDate when history change
  useEffect(() => {
    if (!workspace) {
      return;
    }
    onHistoryUpdated(page => {
      workspace.setPageMeta(page.id, { updatedDate: +new Date() });
    });
  }, [workspace, onHistoryUpdated]);

  useEffect(() => {
    if (!workspace) {
      return;
    }
    setPageList(workspace.meta.pageMetas as PageMeta[]);
    workspace.meta.pagesUpdated.on(res => {
      setPageList(workspace.meta.pageMetas as PageMeta[]);
    });
    return () => {
      // TODO: Does it need to be removed?
      workspace.meta.pagesUpdated.dispose();
    };
  }, [workspace]);

  return (
    <EditorContext.Provider
      value={{
        editor,
        page,
        mode,
        setMode,
        pageList,
        onHistoryUpdated,
        onPropsUpdated,
        ...editorHandlers,
      }}
    >
      <DynamicEditor
        workspace={workspace}
        currentPage={page}
        setEditor={setEditor}
        setWorkspace={setWorkspace}
        setCurrentPage={setPage}
      />
      {workspace && page && editor ? children : <Loading />}
    </EditorContext.Provider>
  );
};

export default EditorProvider;
