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

    // const initialPageId =
    //   workspace.meta.pages.find(p => p.id === (router.query.pageId as string))
    //     ?.id ??
    //   workspace.meta.pages[0]?.id ??
    //   'page0';

    const initialPageId =
      workspace.meta.pages.find(p => p.id === (router.query.pageId as string))
        ?.id ?? 'page0';
    console.log('initialPageId', initialPageId);

    const initialPage = workspace
      .createPage(initialPageId)
      .register(BlockSchema);
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
