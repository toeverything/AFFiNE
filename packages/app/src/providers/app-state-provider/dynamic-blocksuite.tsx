import { useEffect } from 'react';
import {
  Workspace,
  createWebsocketDocProvider,
  IndexedDBDocProvider,
} from '@blocksuite/store';
import '@blocksuite/blocks';
import '@blocksuite/blocks/style';

import type { Page } from '@blocksuite/store';
import { BlockSchema, createEditor } from '@blocksuite/editor';
import type { AppStateContext } from './context';

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

type LoadWorkspaceHandler = AppStateContext['loadWorkspace'];
type CreateEditorHandler = AppStateContext['createEditor'];

interface Props {
  setLoadWorkspaceHandler: (handler: LoadWorkspaceHandler) => void;
  setCreateEditorHandler: (handler: CreateEditorHandler) => void;
}

const DynamicBlocksuite = ({
  setLoadWorkspaceHandler,
  setCreateEditorHandler,
}: Props) => {
  useEffect(() => {
    const openWorkspace: LoadWorkspaceHandler = (workspaceId: string) =>
      new Promise(resolve => {
        const workspace = new Workspace({
          ...getEditorParams(workspaceId as string),
        }).register(BlockSchema);

        const indexDBProvider = workspace.providers.find(
          p => p instanceof IndexedDBDocProvider
        );
        if (indexDBProvider) {
          (indexDBProvider as IndexedDBDocProvider)?.on('synced', () => {
            resolve(workspace);
          });
        } else {
          resolve(workspace);
        }
      });

    setLoadWorkspaceHandler(openWorkspace);
  }, [setLoadWorkspaceHandler]);

  useEffect(() => {
    const createEditorHandler: CreateEditorHandler = (page: Page) => {
      const editor = createEditor(page);
      return editor;
    };

    setCreateEditorHandler(createEditorHandler);
  }, [setCreateEditorHandler]);

  return <></>;
};

export default DynamicBlocksuite;
