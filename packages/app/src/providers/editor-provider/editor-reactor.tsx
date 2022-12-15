import '@blocksuite/blocks';
import '@blocksuite/blocks/style';
import type { EditorContainer } from '@blocksuite/editor';
import { BlockSchema, createEditor } from '@blocksuite/editor';
import { generateDefaultPageId, initialPage } from './utils';
import { useEffect } from 'react';
import pkg from '../../../package.json';
import {
  createWebsocketDocProvider,
  Workspace,
  IndexedDBDocProvider,
  Page,
} from '@blocksuite/store';
import { useRouter } from 'next/router';
import { createPage } from '@/providers/editor-provider/utils';

const getEditorParams = () => {
  const providers = [];
  const params = new URLSearchParams(location.search);
  const room = params.get('room') ?? 'AFFINE-pathfinder';
  if (params.get('syncMode') === 'websocket') {
    const WebsocketDocProvider = createWebsocketDocProvider(
      'ws://127.0.0.1:3000/collaboration/AFFiNE'
    );
    providers.push(WebsocketDocProvider);
  }

  providers.push(IndexedDBDocProvider);

  return {
    room,
    providers,
  };
};

const EditorReactor = ({
  workspace,
  currentPage,
  setEditor,
  setWorkspace,
  setCurrentPage,
}: {
  workspace: Workspace | void;
  currentPage: Page | void;
  setEditor: (editor: EditorContainer) => void;
  setWorkspace: (workspace: Workspace) => void;
  setCurrentPage: (Page: Page) => void;
}) => {
  const {
    query: { pageId: routerPageId },
  } = useRouter();

  useEffect(() => {
    const workspace = new Workspace({
      ...getEditorParams(),
    }).register(BlockSchema);
    //@ts-ignore
    window.workspace = workspace;
    const indexDBProvider = workspace.providers.find(
      p => p instanceof IndexedDBDocProvider
    );
    if (indexDBProvider) {
      (indexDBProvider as IndexedDBDocProvider)?.on('synced', () => {
        setWorkspace(workspace);
      });
    } else {
      setWorkspace(workspace);
    }
  }, [setWorkspace]);

  useEffect(() => {
    if (!workspace) {
      return;
    }

    if (routerPageId) {
      const pageId = routerPageId.toString();
      const page = workspace.getPage(pageId);
      if (page) {
        setCurrentPage(page);
      } else {
        createPage(workspace!, pageId).then(page => {
          initialPage(page);
          setCurrentPage(page);
        });
      }
      return;
    }

    const savedPageId = workspace.meta.pageMetas[0]?.id;
    if (savedPageId) {
      setCurrentPage(workspace.getPage(savedPageId) as Page);
      return;
    }

    createPage(workspace!, generateDefaultPageId()).then(page => {
      initialPage(page);
      setCurrentPage(page);
    });
  }, [workspace, routerPageId, setCurrentPage]);

  useEffect(() => {
    if (!currentPage) {
      return;
    }
    const editor = createEditor(currentPage);
    const pageMeta = workspace?.meta.pageMetas.find(
      p => p.id === currentPage.pageId.replace('space:', '')
    );

    if (pageMeta?.mode) {
      // @ts-ignore
      editor.mode = pageMeta.mode;
    }

    if (pageMeta?.trash) {
      // @ts-ignore
      editor.readonly = true;
    }

    setEditor(editor);
  }, [workspace, currentPage, setEditor]);

  useEffect(() => {
    const version = pkg.dependencies['@blocksuite/editor'].substring(1);
    console.log(`BlockSuite version: ${version}`);
  }, []);

  return <div />;
};

export default EditorReactor;
