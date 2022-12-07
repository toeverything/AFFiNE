import '@blocksuite/blocks';
import '@blocksuite/blocks/style';
import type { EditorContainer } from '@blocksuite/editor';
import { BlockSchema, createEditor } from '@blocksuite/editor';
import { useEffect } from 'react';
import pkg from '../../../package.json';
import {
  createWebsocketDocProvider,
  Workspace,
  IndexedDBDocProvider,
  Page,
} from '@blocksuite/store';
import { useRouter } from 'next/router';

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
  if (params.get('syncMode') === 'indexeddb') {
    providers.push(IndexedDBDocProvider);
  }

  return {
    room,
    providers,
  };
};

const InitialEditor = ({
  workspace,
  currentPage,
  setBlockSchema,
  setEditor,
  setWorkspace,
  setCurrentPage,
}: {
  workspace: Workspace | null;
  currentPage: Page | null;
  setBlockSchema: (blockSchema: typeof BlockSchema) => void;
  setEditor: (editor: EditorContainer) => void;
  setWorkspace: (workspace: Workspace) => void;
  setCurrentPage: (Page: Page) => void;
}) => {
  setBlockSchema(BlockSchema);

  const router = useRouter();

  useEffect(() => {
    const workspace = new Workspace({
      ...getEditorParams(),
    });
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
    let initialPage =
      workspace.pages.get(`space:${router.query.pageId}`) ??
      [...workspace.pages.values()][0];

    if (!initialPage) {
      const pageId = `${router.query.pageId}` ?? 'page0';
      initialPage = workspace.createPage(pageId).register(BlockSchema);
    }
    setCurrentPage(initialPage);
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

export default InitialEditor;
