import { useEffect } from 'react';
import type { Page } from '@blocksuite/store';
import {
  // createWebsocketDocProvider,
  IndexedDBDocProvider,
  Workspace,
} from '@blocksuite/store';
import '@blocksuite/blocks';
import '@blocksuite/blocks/style';
import { BlockSchema, createEditor } from '@blocksuite/editor';
import type {
  AppStateContext,
  LoadWorkspaceHandler,
  CreateEditorHandler,
} from './context';
import { downloadWorkspace, getToken } from '@pathfinder/data-services';
import { WebsocketProvider } from './y-websocket';

const getEditorParams = (workspaceId: string) => {
  const providers = [];
  const params = new URLSearchParams(location.search);
  // const room = params.get('room') ?? 'AFFINE-pathfinder';
  // if (params.get('syncMode') === 'websocket') {
  //   const WebsocketDocProvider = createWebsocketDocProvider(
  //     `ws://${window.location.host}/collaboration/`
  //   );
  //   providers.push(WebsocketDocProvider);
  // }

  providers.push(IndexedDBDocProvider);

  return {
    room: workspaceId,
    providers,
  };
};

interface Props {
  setLoadWorkspaceHandler: (handler: LoadWorkspaceHandler) => void;
  setCreateEditorHandler: (handler: CreateEditorHandler) => void;
}

const DynamicBlocksuite = ({
  setLoadWorkspaceHandler,
  setCreateEditorHandler,
}: Props) => {
  useEffect(() => {
    const openWorkspace: LoadWorkspaceHandler = (
      workspaceId: string,
      websocket = false
    ) =>
      new Promise(async resolve => {
        const workspace = new Workspace({
          room: workspaceId,
          providers: [IndexedDBDocProvider],
        }).register(BlockSchema);

        const refreshToken = getToken()?.refreshToken;

        if (
          websocket &&
          refreshToken &&
          location.search.includes('sync=websocket')
        ) {
          // FIXME: if add websocket provider, the first page will be blank
          const ws = new WebsocketProvider(
            `ws${window.location.protocol === 'https:' ? 's' : ''}://${
              window.location.host
            }/api/sync/`,
            workspaceId,
            workspace.doc,
            {
              params: {
                token: refreshToken,
              },
              awareness: workspace.meta.awareness.awareness,
            }
          );

          ws.shouldConnect = false;

          // FIXME: there needs some method to destroy websocket.
          // Or we need a manager to manage websocket.
          // @ts-expect-error
          workspace.__ws__ = ws;
        }

        const indexDBProvider = workspace.providers.find(
          p => p instanceof IndexedDBDocProvider
        );
        if (indexDBProvider) {
          (indexDBProvider as IndexedDBDocProvider).on('synced', async () => {
            const updates = await downloadWorkspace({ workspaceId });

            if (updates && updates.byteLength) {
              Workspace.Y.applyUpdate(workspace.doc, new Uint8Array(updates));
              // if after update, the space:meta is empty, then we need to get map with doc
              workspace.doc.getMap('space:meta');
            }

            resolve(workspace);
          });
        } else {
          const updates = await downloadWorkspace({ workspaceId });
          updates &&
            Workspace.Y.applyUpdate(workspace.doc, new Uint8Array(updates));
          // if after update, the space:meta is empty, then we need to get map with doc
          workspace.doc.getMap('space:meta');
          resolve(workspace);
        }
      });

    setLoadWorkspaceHandler(openWorkspace);
  }, [setLoadWorkspaceHandler]);

  useEffect(() => {
    const createEditorHandler: CreateEditorHandler = (page: Page) => {
      return createEditor(page);
    };

    setCreateEditorHandler(createEditorHandler);
  }, [setCreateEditorHandler]);

  return <></>;
};

export default DynamicBlocksuite;
