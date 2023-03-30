import {
  workspaceDetailSchema,
  workspaceSchema,
} from '@affine/workspace/affine/api';
import { WebsocketClient } from '@affine/workspace/affine/channel';
import { jotaiStore, jotaiWorkspacesAtom } from '@affine/workspace/atom';
import type { WorkspaceCRUD } from '@affine/workspace/type';
import type { WorkspaceFlavour } from '@affine/workspace/type';
import { assertExists } from '@blocksuite/global/utils';
import { z } from 'zod';

const channelMessageSchema = z.object({
  ws_list: z.array(workspaceSchema),
  ws_details: z.record(workspaceDetailSchema),
  metadata: z.record(
    z.object({
      avatar: z.string(),
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
        jotaiStore.set(jotaiWorkspacesAtom, workspaces => {
          const idx = workspaces.findIndex(workspace => workspace.id === id);
          workspaces.splice(idx, 1);
          return [...workspaces];
        });
      }
    }
  }

  return {
    connect: () => {
      client = new WebsocketClient(
        `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${
          window.location.host
        }/api/global/sync`
      );
      client.connect(handleMessage);
    },
    disconnect: () => {
      assertExists(client, 'client is null');
      client.disconnect();
      client = null;
    },
  };
}
