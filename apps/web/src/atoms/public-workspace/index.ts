import type { BlockSuiteFeatureFlags } from '@affine/env';
import { config } from '@affine/env';
import type { AffinePublicWorkspace } from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { affineApis } from '@affine/workspace/affine/shared';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { atom } from 'jotai';

import { BlockSuiteWorkspace } from '../../shared';

function createPublicWorkspace(
  workspaceId: string,
  binary: ArrayBuffer,
  singlePage = false
): AffinePublicWorkspace {
  const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
    workspaceId,
    WorkspaceFlavour.AFFINE,
    {
      workspaceApis: affineApis,
      cachePrefix: WorkspaceFlavour.PUBLIC + (singlePage ? '-single-page' : ''),
    }
  );
  BlockSuiteWorkspace.Y.applyUpdate(
    blockSuiteWorkspace.doc,
    new Uint8Array(binary)
  );
  Object.entries(config.editorFlags).forEach(([key, value]) => {
    blockSuiteWorkspace.awarenessStore.setFlag(
      key as keyof BlockSuiteFeatureFlags,
      value
    );
  });
  // force disable some features
  blockSuiteWorkspace.awarenessStore.setFlag('enable_block_hub', false);
  blockSuiteWorkspace.awarenessStore.setFlag('enable_drag_handle', false);
  return {
    flavour: WorkspaceFlavour.PUBLIC,
    id: workspaceId,
    blockSuiteWorkspace,
  };
}

export const publicWorkspaceIdAtom = atom<string | null>(null);
export const publicWorkspacePageIdAtom = atom<string | null>(null);
export const publicPageBlockSuiteAtom = atom<Promise<AffinePublicWorkspace>>(
  async get => {
    const workspaceId = get(publicWorkspaceIdAtom);
    const pageId = get(publicWorkspacePageIdAtom);
    if (!workspaceId || !pageId) {
      throw new Error('No workspace id or page id');
    }
    const binary = await affineApis.downloadPublicWorkspacePage(
      workspaceId,
      pageId
    );
    return createPublicWorkspace(workspaceId, binary, true);
  }
);
export const publicWorkspaceAtom = atom<Promise<AffinePublicWorkspace>>(
  async get => {
    const workspaceId = get(publicWorkspaceIdAtom);
    if (!workspaceId) {
      throw new Error('No workspace id');
    }
    const binary = await affineApis.downloadWorkspace(workspaceId, true);
    return createPublicWorkspace(workspaceId, binary, false);
  }
);
