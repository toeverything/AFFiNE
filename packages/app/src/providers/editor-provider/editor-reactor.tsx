import '@blocksuite/blocks';
import '@blocksuite/blocks/style';
import type { EditorContainer } from '@blocksuite/editor';
import { BlockSchema, createEditor } from '@blocksuite/editor';
import {
  generateDefaultPageId,
  getEditor,
  initIntroduction,
  initIntroductionMeta,
} from './utils';
import { useEffect, useRef } from 'react';
import pkg from '../../../package.json';
import {
  createWebsocketDocProvider,
  Workspace,
  IndexedDBDocProvider,
  Page,
} from '@blocksuite/store';
import { useRouter } from 'next/router';
import { createPage } from '@/providers/editor-provider/utils';

const getEditorParams = (workspaceId: string) => {
  const providers = [];
  const params = new URLSearchParams(location.search);
  // const room = params.get('room') ?? 'AFFINE-pathfinder';
  if (params.get('syncMode') === 'websocket') {
    const WebsocketDocProvider = createWebsocketDocProvider(
      `ws://${window.location.host}/collaboration/`
    );
    providers.push(WebsocketDocProvider);
  }

  providers.push(IndexedDBDocProvider);

  return {
    room: workspaceId,
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
  const shouldInitIntroduction = useRef(false);
  const {
    query: { pageId0: routerPageId },
  } = useRouter();
  const workspaceId = 'sfas';

  useEffect(() => {
    const workspace = new Workspace({
      ...getEditorParams(workspaceId as string),
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
  }, [setWorkspace, workspaceId]);

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
          shouldInitIntroduction.current = true;
          initIntroductionMeta(workspace!, page);
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
      shouldInitIntroduction.current = true;
      initIntroductionMeta(workspace!, page);
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

    const onEditorInsertHandler = () => {
      const editor = getEditor();
      // Editor is different from the previous one witch is not inserted into the DOM
      setEditor(editor as EditorContainer);
      if (shouldInitIntroduction.current) {
        shouldInitIntroduction.current = false;
        initIntroduction(workspace!, editor as EditorContainer);
      }
    };

    editor.addEventListener(
      'DOMNodeInsertedIntoDocument',
      onEditorInsertHandler
    );
    setEditor(editor);

    return () => {
      editor.removeEventListener(
        'DOMNodeInsertedIntoDocument',
        onEditorInsertHandler
      );
    };
  }, [workspace, currentPage, setEditor]);

  useEffect(() => {
    const version = pkg.dependencies['@blocksuite/editor'].substring(1);
    console.log(`BlockSuite version: ${version}`);
  }, []);

  return <div />;
};

export default EditorReactor;
