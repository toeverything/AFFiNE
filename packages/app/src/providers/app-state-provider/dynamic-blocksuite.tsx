import { useEffect } from 'react';
import type { Page } from '@blocksuite/store';
import { Workspace as StoreWorkspace } from '@blocksuite/store';
import '@blocksuite/blocks';
import { EditorContainer } from '@blocksuite/editor';
import { BlockSchema } from '@blocksuite/blocks/models';
import type { LoadWorkspaceHandler, CreateEditorHandler } from './context';
import { downloadWorkspace, getDataCenter } from '@affine/datacenter';

interface Props {
  setLoadWorkspaceHandler: (handler: LoadWorkspaceHandler) => void;
  setCreateEditorHandler: (handler: CreateEditorHandler) => void;
}

const DynamicBlocksuite = ({
  setLoadWorkspaceHandler,
  setCreateEditorHandler,
}: Props) => {
  useEffect(() => {
    const openWorkspace: LoadWorkspaceHandler = (workspaceId: string, user) =>
      // eslint-disable-next-line no-async-promise-executor
      new Promise(async resolve => {
        const dc = await getDataCenter();
        const workspace = await dc.initWorkspace(
          workspaceId,
          new StoreWorkspace({
            room: workspaceId,
          }).register(BlockSchema)
        );

        // console.log('websocket', websocket);
        console.log('user', user);

        // if (websocket && token.refresh) {
        //   // FIXME: if add websocket provider, the first page will be blank
        //   const ws = new WebsocketProvider(
        //     `ws${window.location.protocol === 'https:' ? 's' : ''}://${
        //       window.location.host
        //     }/api/sync/`,
        //     workspaceId,
        //     workspace.doc,
        //     {
        //       params: {
        //         token: token.refresh,
        //       },
        //       awareness: workspace.meta.awareness.awareness,
        //     }
        //   );
        //
        //   ws.shouldConnect = false;
        //
        //   // FIXME: there needs some method to destroy websocket.
        //   // Or we need a manager to manage websocket.
        //   // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //   // @ts-expect-error
        //   workspace.__ws__ = ws;
        // }

        // const indexDBProvider = workspace.providers.find(
        //   p => p instanceof IndexedDBDocProvider
        // );
        // if (user) {
        //   const updates = await downloadWorkspace({ workspaceId });
        //   updates &&
        //     StoreWorkspace.Y.applyUpdate(
        //       workspace.doc,
        //       new Uint8Array(updates)
        //     );
        //   // if after update, the space:meta is empty, then we need to get map with doc
        //   workspace.doc.getMap('space:meta');
        // }

        // if (indexDBProvider) {
        //   (indexDBProvider as IndexedDBDocProvider).whenSynced.then(() => {
        //     resolve(workspace);
        //   });
        // } else {
        resolve(workspace);
        // }
      });

    setLoadWorkspaceHandler(openWorkspace);
  }, [setLoadWorkspaceHandler]);

  useEffect(() => {
    const createEditorHandler: CreateEditorHandler = (page: Page) => {
      const editor = new EditorContainer();
      editor.page = page;
      return editor;
    };

    setCreateEditorHandler(createEditorHandler);
  }, [setCreateEditorHandler]);

  return <></>;
};

export default DynamicBlocksuite;
