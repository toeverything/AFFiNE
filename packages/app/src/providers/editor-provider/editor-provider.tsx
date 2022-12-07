import type { EditorContainer } from '@blocksuite/editor';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import dynamic from 'next/dynamic';
import Loading from './loading';
import { Page, Workspace } from '@blocksuite/store';
import { BlockSchema } from '@blocksuite/editor/dist/block-loader';
import { useRouter } from 'next/router';

// Blocksuite has to be imported dynamically since it has a lot of effects
const DynamicEditor = dynamic(() => import('./initial-editor'), {
  ssr: false,
});

type EditorContextValue = {
  mode: EditorContainer['mode'];
  setMode: (mode: EditorContainer['mode']) => void;
  currentPage: Page | null;
  editor: EditorContainer | null;
};

// type EditorHandlers = {
//   createPage: (props: { pageId?: string; title?: '' }) => void;
//   openPage: (props: {
//     pageId: string;
//     query?: { [key: string]: string };
//   }) => Promise<boolean>;
// };

type EditorContextProps = PropsWithChildren<{}>;

export const EditorContext = createContext<EditorContextValue>({
  mode: 'page',
  setMode: () => {},
  currentPage: null,
  editor: null,
});

export const useEditor = () => useContext(EditorContext);

export const EditorProvider = ({
  children,
}: PropsWithChildren<EditorContextProps>) => {
  const router = useRouter();
  const blockSchemaRef = useRef<typeof BlockSchema | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [currentPage, setCurrentPage] = useState<Page | null>(null);
  const [editor, setEditor] = useState<EditorContainer | null>(null);
  const [mode, setMode] = useState<EditorContainer['mode']>('page');

  useEffect(() => {
    const event = new CustomEvent('affine.switch-mode', { detail: mode });
    window.dispatchEvent(event);
  }, [mode]);

  const editorHandler = {
    createPage: ({
      pageId = new Date().getTime().toString(),
      title,
    }: {
      pageId?: string;
      title?: '';
    }) => {
      blockSchemaRef.current &&
        workspace?.createPage(pageId, title).register(blockSchemaRef.current);
    },
    openPage: (pageId: string, query: { [key: string]: string } = {}) => {
      return router.push({
        pathname: '/',
        query: {
          pageId,
          ...query,
        },
      });
    },
    getPageList: () => {
      return workspace?.meta.pages;
    },
    deletePage: (pageId: string) => {
      workspace?.setPage(pageId, { trash: true });
    },
    recyclePage: (pageId: string) => {
      workspace?.setPage(pageId, { trash: false });
    },
    favoritePage: (pageId: string) => {
      workspace?.setPage(pageId, { favorite: true });
    },
    unFavoritePage: (pageId: string) => {
      workspace?.setPage(pageId, { favorite: true });
    },
  };

  return (
    <EditorContext.Provider value={{ editor, currentPage, mode, setMode }}>
      <DynamicEditor
        workspace={workspace}
        currentPage={currentPage}
        setBlockSchema={blockSchema => {
          if (!blockSchemaRef.current) {
            blockSchemaRef.current = blockSchema;
          }
        }}
        setEditor={setEditor}
        setWorkspace={setWorkspace}
        setCurrentPage={setCurrentPage}
      />
      {workspace && currentPage && editor ? children : <Loading />}
    </EditorContext.Provider>
  );
};

export default EditorProvider;
