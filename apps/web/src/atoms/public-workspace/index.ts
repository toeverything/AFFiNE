import { getLoginStorage } from '@affine/workspace/affine/login';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { atom } from 'jotai';

import { BlockSuiteWorkspace } from '../../shared';
import { affineApis } from '../../shared/apis';

export const publicWorkspaceIdAtom = atom<string | null>(null);
export const publicBlockSuiteAtom = atom<Promise<BlockSuiteWorkspace>>(
  async get => {
    const workspaceId = get(publicWorkspaceIdAtom);
    if (!workspaceId) {
      throw new Error('No workspace id');
    }
    const binary = await affineApis.downloadWorkspace(workspaceId, true);
    const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
      workspaceId,
      (k: string) =>
        // fixme: token could be expired
        ({ api: `api/workspace`, token: getLoginStorage()?.token }[k])
    );
    BlockSuiteWorkspace.Y.applyUpdate(
      blockSuiteWorkspace.doc,
      new Uint8Array(binary)
    );
    blockSuiteWorkspace.awarenessStore.setFlag('enable_block_hub', false);
    blockSuiteWorkspace.awarenessStore.setFlag('enable_set_remote_flag', false);
    blockSuiteWorkspace.awarenessStore.setFlag('enable_database', false);
    blockSuiteWorkspace.awarenessStore.setFlag(
      'enable_edgeless_toolbar',
      false
    );
    blockSuiteWorkspace.awarenessStore.setFlag('enable_slash_menu', false);
    blockSuiteWorkspace.awarenessStore.setFlag('enable_drag_handle', false);
    return blockSuiteWorkspace;
  }
);
