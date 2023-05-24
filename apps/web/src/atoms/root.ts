//#region async atoms that to load the real workspace data
import { DebugLogger } from '@affine/debug';
import { config } from '@affine/env';
import {
  rootCurrentWorkspaceIdAtom,
  rootWorkspacesMetadataAtom,
} from '@affine/workspace/atom';
import type {
  NecessaryProvider,
  WorkspaceRegistry,
} from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { assertExists } from '@blocksuite/store';
import { atom } from 'jotai';

import type { AllWorkspace } from '../shared';

const logger = new DebugLogger('web:atoms:root');

/**
 * Fetch all workspaces from the Plugin CRUD
 */
export const workspacesAtom = atom<Promise<AllWorkspace[]>>(async get => {
  const { WorkspaceAdapters } = await import('../adapters/workspace');
  const flavours: string[] = Object.values(WorkspaceAdapters).map(
    plugin => plugin.flavour
  );
  const jotaiWorkspaces = get(rootWorkspacesMetadataAtom)
    .filter(
      workspace => flavours.includes(workspace.flavour)
      // TODO: remove this when we remove the legacy cloud
    )
    .filter(workspace =>
      !config.enableLegacyCloud
        ? workspace.flavour !== WorkspaceFlavour.AFFINE
        : true
    );
  const workspaces = await Promise.all(
    jotaiWorkspaces.map(workspace => {
      const plugin =
        WorkspaceAdapters[workspace.flavour as keyof typeof WorkspaceAdapters];
      assertExists(plugin);
      const { CRUD } = plugin;
      return CRUD.get(workspace.id).then(workspace => {
        if (workspace === null) {
          console.warn(
            'workspace is null. this should not happen. If you see this error, please report it to the developer.'
          );
        }
        return workspace;
      });
    })
  ).then(workspaces =>
    workspaces.filter(
      (workspace): workspace is WorkspaceRegistry['affine' | 'local'] =>
        workspace !== null
    )
  );
  const workspaceProviders = workspaces.map(workspace =>
    workspace.providers.filter(
      (provider): provider is NecessaryProvider =>
        'necessary' in provider && provider.necessary
    )
  );
  const promises: Promise<void>[] = [];
  for (const providers of workspaceProviders) {
    for (const provider of providers) {
      provider.sync();
      promises.push(provider.whenReady);
    }
  }
  // we will wait for all the necessary providers to be ready
  await Promise.all(promises);
  logger.info('workspaces', workspaces);
  return workspaces;
});

/**
 * This will throw an error if the workspace is not found,
 * should not be used on the root component,
 * use `rootCurrentWorkspaceIdAtom` instead
 */
export const rootCurrentWorkspaceAtom = atom<Promise<AllWorkspace>>(
  async get => {
    const { WorkspaceAdapters } = await import('../adapters/workspace');
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
    const workspace = await WorkspaceAdapters[targetWorkspace.flavour].CRUD.get(
      targetWorkspace.id
    );
    if (!workspace) {
      throw new Error(
        `cannot find the workspace with id ${targetId} in the plugin ${targetWorkspace.flavour}.`
      );
    }
    const providers = workspace.providers.filter(
      (provider): provider is NecessaryProvider =>
        'necessary' in provider && provider.necessary === true
    );
    for (const provider of providers) {
      provider.sync();
      // we will wait for the necessary providers to be ready
      await provider.whenReady;
    }
    logger.info('current workspace', workspace);
    globalThis.currentWorkspace = workspace;
    globalThis.dispatchEvent(
      new CustomEvent('affine:workspace:change', {
        detail: { id: workspace.id },
      })
    );
    return workspace;
  }
);

declare global {
  /**
   * @internal debug only
   */
  // eslint-disable-next-line no-var
  var currentWorkspace: AllWorkspace | undefined;
  interface WindowEventMap {
    'affine:workspace:change': CustomEvent<{ id: string }>;
  }
}

// Do not add `rootCurrentWorkspacePageAtom`, this is not needed.
// It can be derived from `rootCurrentWorkspaceAtom` and `rootCurrentPageIdAtom`

//#endregion
