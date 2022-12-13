import type { EditorContainer } from '@blocksuite/editor';
import { createContext, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import dynamic from 'next/dynamic';
import Loading from './loading';
import { Page, Workspace } from '@blocksuite/store';
import useEditorHandler from './useEditorHandler';
import { EditorHandlers, PageMeta } from './interface';

// Blocksuite has to be imported dynamically since it has a lot of effects
const DynamicEditor = dynamic(() => import('./editor-reactor'), {
  ssr: false,
});

type EditorContextValue = {
  mode: EditorContainer['mode'];
  setMode: (mode: EditorContainer['mode']) => void;
  currentPage: Page | void;
  editor: EditorContainer | void;
  pageList: PageMeta[];
} & EditorHandlers;

type EditorContextProps = PropsWithChildren<{}>;

export const EditorContext = createContext<EditorContextValue>({
  mode: 'page',
  setMode: () => {},
  pageList: [],
  currentPage: undefined,
  editor: undefined,
  ...({} as EditorHandlers),
});

export const useEditor = () => useContext(EditorContext);

export const EditorProvider = ({
  children,
}: PropsWithChildren<EditorContextProps>) => {
  const [workspace, setWorkspace] = useState<Workspace>();
  const [currentPage, setCurrentPage] = useState<Page>();
  const [pageList, setPageList] = useState<PageMeta[]>([]);
  const [editor, setEditor] = useState<EditorContainer>();
  const [mode, setMode] = useState<EditorContainer['mode']>('page');

  const editorHandlers = useEditorHandler(workspace);

  useEffect(() => {
    const event = new CustomEvent('affine.switch-mode', { detail: mode });
    window.dispatchEvent(event);
  }, [mode]);

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
        currentPage,
        mode,
        setMode,
        pageList,
        ...editorHandlers,
      }}
    >
      <DynamicEditor
        workspace={workspace}
        currentPage={currentPage}
        setEditor={setEditor}
        setWorkspace={setWorkspace}
        setCurrentPage={setCurrentPage}
      />
      {workspace && currentPage && editor ? children : <Loading />}
    </EditorContext.Provider>
  );
};

export default EditorProvider;
