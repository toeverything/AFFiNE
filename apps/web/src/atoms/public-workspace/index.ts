import { atom } from 'jotai/index';

import {
  BlockSuiteWorkspace,
  LocalWorkspace,
  RemWorkspaceFlavour,
} from '../../shared';
import { apis } from '../../shared/apis';
import { createEmptyBlockSuiteWorkspace } from '../../utils';

export const publicWorkspaceIdAtom = atom<string | null>(null);
export const publicBlockSuiteAtom = atom<Promise<BlockSuiteWorkspace>>(
  async get => {
    const workspaceId = get(publicWorkspaceIdAtom);
    if (!workspaceId) {
      throw new Error('No workspace id');
    }
    const binary = await apis.downloadWorkspace(workspaceId, true);
    const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
      workspaceId,
      (_: string) => undefined
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
    return new Promise(resolve => {
      setTimeout(() => {
        const workspace: LocalWorkspace = {
          id: workspaceId,
          blockSuiteWorkspace,
          flavour: RemWorkspaceFlavour.LOCAL,
          syncBinary: () => Promise.resolve(workspace),
          providers: [],
        };
        dataCenter.workspaces.push(workspace);
        dataCenter.callbacks.forEach(cb => cb());
        resolve(blockSuiteWorkspace);
      }, 0);
    });
  }
);
