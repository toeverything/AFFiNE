//#region async atoms that to load the real workspace data
import { DebugLogger } from '@affine/debug';
import {
  rootCurrentWorkspaceIdAtom,
  rootWorkspacesMetadataAtom,
} from '@affine/workspace/atom';
import { assertExists } from '@blocksuite/store';
import { atom } from 'jotai';

import { WorkspacePlugins } from '../plugins';
import type { AllWorkspace } from '../shared';

const logger = new DebugLogger('web:atoms:root');

/**
 * Fetch all workspaces from the Plugin CRUD
 */
export const workspacesAtom = atom<Promise<AllWorkspace[]>>(async get => {
  const flavours: string[] = Object.values(WorkspacePlugins).map(
    plugin => plugin.flavour
  );
  const jotaiWorkspaces = get(rootWorkspacesMetadataAtom).filter(workspace =>
    flavours.includes(workspace.flavour)
  );
  const workspaces = await Promise.all(
    jotaiWorkspaces.map(workspace => {
      const plugin =
        WorkspacePlugins[workspace.flavour as keyof typeof WorkspacePlugins];
      assertExists(plugin);
      const { CRUD } = plugin;
      return CRUD.get(workspace.id);
    })
  );
  logger.info('workspaces', workspaces);
  workspaces.forEach(workspace => {
    if (workspace === null) {
      console.warn(
        'workspace is null. this should not happen. If you see this error, please report it to the developer.'
      );
    }
  });
  return workspaces.filter(workspace => workspace !== null) as AllWorkspace[];
});

/**
 * This will throw an error if the workspace is not found,
 * should not be used on the root component,
 * use `rootCurrentWorkspaceIdAtom` instead
 */
export const rootCurrentWorkspaceAtom = atom<Promise<AllWorkspace>>(
  async get => {
    const metadata = get(rootWorkspacesMetadataAtom);
    const targetId = get(rootCurrentWorkspaceIdAtom);
    if (targetId === null) {
      throw new Error(
        'current workspace id is null. this should not happen. If you see this error, please report it to the developer.'
      );
    }
    const targetWorkspace = metadata.find(meta => meta.id === targetId);
    if (!targetWorkspace) {
      throw new Error(`cannot find the workspace with id ${targetId}.`);
    }
    const workspace = await WorkspacePlugins[targetWorkspace.flavour].CRUD.get(
      targetWorkspace.id
    );
    if (!workspace) {
      throw new Error(
        `cannot find the workspace with id ${targetId} in the plugin ${targetWorkspace.flavour}.`
      );
    }
    return workspace;
  }
);

// Do not add `rootCurrentWorkspacePageAtom`, this is not needed.
// It can be derived from `rootCurrentWorkspaceAtom` and `rootCurrentPageIdAtom`

//#endregion
