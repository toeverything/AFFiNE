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
  const router = useRouter();

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

    const initialPageId =
      workspace.meta.pageMetas.find(
        p => p.id === (router.query.pageId as string)
      )?.id ?? workspace.meta.pageMetas[0]?.id;

    if (!initialPageId) {
      createPage(workspace!, generateDefaultPageId()).then(page => {
        initialPage(page);
        setCurrentPage(page);
      });
    } else {
      const page = workspace.getPage(initialPageId);
      setCurrentPage(page);
    }
  }, [workspace, router.query.pageId, setCurrentPage]);

  useEffect(() => {
    if (!currentPage) {
      return;
    }
    setEditor(createEditor(currentPage));
  }, [currentPage, setEditor]);

  useEffect(() => {
    const version = pkg.dependencies['@blocksuite/editor'].substring(1);
    console.log(`BlockSuite version: ${version}`);
  }, []);

  return <div />;
};

export default EditorReactor;
