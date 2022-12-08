import type { EditorContainer } from '@blocksuite/editor';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import dynamic from 'next/dynamic';
import Loading from './loading';
import { Page, Workspace } from '@blocksuite/store';
import { BlockSchema } from '@blocksuite/editor/dist/block-loader';
import { useRouter } from 'next/router';
export interface PageMeta {
  id: string;
  title: string;
  favorite: boolean;
  trash: boolean;
  createDate: number;
  trashDate: number | null;
}
// Blocksuite has to be imported dynamically since it has a lot of effects
const DynamicEditor = dynamic(() => import('./initial-editor'), {
  ssr: false,
});

type EditorContextValue = {
  mode: EditorContainer['mode'];
  setMode: (mode: EditorContainer['mode']) => void;
  currentPage: Page | null;
  editor: EditorContainer | null;
  pageList: PageMeta[];
} & EditorHandlers;

type EditorHandlers = {
  createPage: (pageId?: string) => void;
  openPage: (
    pageId: string,
    query?: { [key: string]: string }
  ) => Promise<boolean>;
  deletePage: (pageId: string) => void;
  recyclePage: (pageId: string) => void;
  toggleDeletePage: (pageId: string) => void;
  favoritePage: (pageId: string) => void;
  unFavoritePage: (pageId: string) => void;
  toggleFavoritePage: (pageId: string) => void;
};

type EditorContextProps = PropsWithChildren<{}>;

export const EditorContext = createContext<EditorContextValue>({
  mode: 'page',
  setMode: () => {},
  pageList: [],
  currentPage: null,
  editor: null,
  createPage: () => {},
  openPage: async () => {
    return false;
  },
  deletePage: () => {},
  recyclePage: () => {},
  toggleDeletePage: () => {},
  favoritePage: () => {},
  unFavoritePage: () => {},
  toggleFavoritePage: () => {},
});

export const useEditor = () => useContext(EditorContext);

export const EditorProvider = ({
  children,
}: PropsWithChildren<EditorContextProps>) => {
  const router = useRouter();
  const blockSchemaRef = useRef<typeof BlockSchema | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [currentPage, setCurrentPage] = useState<Page | null>(null);
  const [pageList, setPageList] = useState<PageMeta[]>([]);
  const [editor, setEditor] = useState<EditorContainer | null>(null);
  const [mode, setMode] = useState<EditorContainer['mode']>('page');

  useEffect(() => {
    const event = new CustomEvent('affine.switch-mode', { detail: mode });
    window.dispatchEvent(event);
  }, [mode]);

  useEffect(() => {
    if (!workspace) {
      return;
    }
    setPageList(workspace.meta.pages as PageMeta[]);
    workspace.meta.pagesUpdated.on(res => {
      setPageList(workspace.meta.pages as PageMeta[]);
    });
    return () => {
      // TODO: Does it need to be removed?
      workspace.meta.pagesUpdated.dispose();
    };
  }, [workspace]);

  const editorHandler: EditorHandlers = {
    createPage: (pageId = new Date().getTime().toString()) => {
      blockSchemaRef.current &&
        workspace?.createPage(pageId).register(blockSchemaRef.current);
    },
    openPage: (pageId, query = {}) => {
      return router.push({
        pathname: '/',
        query: {
          pageId,
          ...query,
        },
      });
    },
    deletePage: pageId => {
      workspace?.setPage(pageId, { trash: true });
    },
    recyclePage: pageId => {
      workspace?.setPage(pageId, { trash: false });
    },
    toggleDeletePage: pageId => {
      const pageMeta = workspace?.meta.pages.find(p => p.id === pageId);
      if (pageMeta) {
        workspace?.setPage(pageId, { trash: !pageMeta.trash });
      }
    },
    favoritePage: pageId => {
      workspace?.setPage(pageId, { favorite: true });
    },
    unFavoritePage: pageId => {
      workspace?.setPageMeta(pageId, { favorite: true });
    },
    toggleFavoritePage: pageId => {
      const pageMeta = workspace?.meta.pages.find(p => p.id === pageId);
      if (pageMeta) {
        workspace?.setPageMeta(pageId, { favorite: !pageMeta.favorite });
      }
    },
  };

  return (
    <EditorContext.Provider
      value={{ editor, currentPage, mode, setMode, pageList, ...editorHandler }}
    >
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
