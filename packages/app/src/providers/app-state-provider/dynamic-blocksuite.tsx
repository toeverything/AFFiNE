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
import {
  downloadWorkspace,
  token,
  WebsocketProvider,
} from '@pathfinder/data-services';

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
      // eslint-disable-next-line no-async-promise-executor
      new Promise(async resolve => {
        const workspace = new Workspace({
          room: workspaceId,
          providers: [],
        }).register(BlockSchema);

        if (websocket && token.refresh) {
          // FIXME: if add websocket provider, the first page will be blank
          const ws = new WebsocketProvider(
            `ws${window.location.protocol === 'https:' ? 's' : ''}://${
              window.location.host
            }/api/sync/`,
            workspaceId,
            workspace.doc,
            {
              params: {
                token: token.refresh,
              },
              awareness: workspace.meta.awareness.awareness,
            }
          );

          ws.shouldConnect = false;

          // FIXME: there needs some method to destroy websocket.
          // Or we need a manager to manage websocket.
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          workspace.__ws__ = ws;
        }

        const indexDBProvider = workspace.providers.find(
          p => p instanceof IndexedDBDocProvider
        );
        const updates = await downloadWorkspace({ workspaceId });
        updates &&
          Workspace.Y.applyUpdate(workspace.doc, new Uint8Array(updates));
        // if after update, the space:meta is empty, then we need to get map with doc
        workspace.doc.getMap('space:meta');
        if (indexDBProvider) {
          (indexDBProvider as IndexedDBDocProvider).on('synced', async () => {
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
      return createEditor(page);
    };

    setCreateEditorHandler(createEditorHandler);
  }, [setCreateEditorHandler]);

  return <></>;
};

export default DynamicBlocksuite;
