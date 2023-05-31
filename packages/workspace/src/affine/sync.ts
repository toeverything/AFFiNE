import { DebugLogger } from '@affine/debug';
import { websocketPrefixUrl } from '@affine/env/api';
import { assertExists } from '@blocksuite/global/utils';
import type { Disposable } from '@blocksuite/store';
import { z } from 'zod';

import { workspaceDetailSchema, workspaceSchema } from '../affine/api';
import { WebsocketClient } from '../affine/channel';
import { storageChangeSlot } from '../affine/login';
import { rootStore, rootWorkspacesMetadataAtom } from '../atom';
import type { WorkspaceCRUD } from '../type';
import type { WorkspaceFlavour } from '../type';

const logger = new DebugLogger('affine-sync');

const channelMessageSchema = z.object({
  ws_list: z.array(workspaceSchema),
  ws_details: z.record(workspaceDetailSchema),
  metadata: z.record(
    z.object({
      search_index: z.array(z.string()),
      name: z.string(),
    })
  ),
});

type ChannelMessage = z.infer<typeof channelMessageSchema>;

export function createAffineGlobalChannel(
  crud: WorkspaceCRUD<WorkspaceFlavour.AFFINE>
) {
  let client: WebsocketClient | null;

  async function handleMessage(channelMessage: ChannelMessage) {
    logger.debug('channelMessage', channelMessage);
    const parseResult = channelMessageSchema.safeParse(channelMessage);
    if (!parseResult.success) {
      console.error(
        'channelMessageSchema.safeParse(channelMessage) failed',
        parseResult
      );
    }
    const { ws_details } = channelMessage;
    const currentWorkspaces = await crud.list();
    for (const [id] of Object.entries(ws_details)) {
      const workspaceIndex = currentWorkspaces.findIndex(
        workspace => workspace.id === id
      );

      // If the workspace is not in the current workspace list, remove it
      if (workspaceIndex === -1) {
        rootStore.set(rootWorkspacesMetadataAtom, workspaces => {
          const idx = workspaces.findIndex(workspace => workspace.id === id);
          workspaces.splice(idx, 1);
          return [...workspaces];
        });
      }
    }
  }
  let dispose: Disposable | undefined = undefined;
  const apis = {
    connect: () => {
      client = new WebsocketClient(websocketPrefixUrl + '/api/global/sync/');
      client.connect(handleMessage);
      dispose = storageChangeSlot.on(() => {
        apis.disconnect();
        apis.connect();
      });
    },
    disconnect: () => {
      assertExists(client, 'client is null');
      client.disconnect();
      dispose?.dispose();
      client = null;
    },
  };

  return apis;
}
