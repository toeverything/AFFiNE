import { getLoginStorage } from '@affine/workspace/affine/login';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { atom } from 'jotai/index';

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
    // fixme: this is a hack
    const params = new URLSearchParams(window.location.search);
    const prefixUrl = params.get('prefixUrl')
      ? (params.get('prefixUrl') as string)
      : '/';
    const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
      workspaceId,
      (k: string) =>
        // fixme: token could be expired
        ({ api: `${prefixUrl}api/workspace`, token: getLoginStorage()?.token }[
          k
        ])
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
        // const workspace: LocalWorkspace = {
        //   id: workspaceId,
        //   blockSuiteWorkspace,
        //   flavour: RemWorkspaceFlavour.LOCAL,
        //   providers: [],
        // };
        // fixme: quick search won't work, ASAP
        // dataCenter.workspaces.push(workspace);
        // dataCenter.callbacks.forEach(cb => cb());
        resolve(blockSuiteWorkspace);
      }, 0);
    });
  }
);
